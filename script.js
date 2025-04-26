const axios = require('axios')
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const AnonymizeUA = require('puppeteer-extra-plugin-anonymize-ua')
const randomUseragent = require('random-useragent')
const cheerio = require('cheerio')

const PROXIES = [
    // list your proxies for ip rotation here like this:
    // 'username:password@ip:port'
]

// Function to get a random proxy from the list
function getRandomProxy() {
    const proxy = PROXIES[Math.floor(Math.random() * PROXIES.length)]
    return `http://${proxy}`
}

// Puppeteer setup with stealth and anonymize plugins
puppeteer.use(StealthPlugin())
puppeteer.use(
    AnonymizeUA({
        customFn: () => randomUseragent.getRandom(),
    })
)

const API_BASE = '' // your API base URL here
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// different viewports for randomization
const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1600, height: 900 },
]

// function that simulates human-like scrolling
async function humanScroll(page) {
    const dist = Math.floor(Math.random() * 300) + 300
    await page.evaluate(async (d) => {
        window.scrollBy(0, d)
        await new Promise((r) => setTimeout(r, Math.random() * 500 + 300))
        window.scrollBy(0, -d / 2)
    }, dist)
}

async function scrapeAndUpdate() {
    const proxy = getRandomProxy()
    console.log(`Using proxy: ${proxy}`)

    const browser = await puppeteer.launch({
        headless: false,
        args: [
            `--proxy-server=${proxy}`,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=site-per-process',
        ],
    })

    let page = await browser.newPage()
    await page.setViewport(
        VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
    )

    await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
    })

    try {
        // First verify connection to medex.com.bd
        console.log('Checking connection with medex.com.bd')
        await page.goto('https://medex.com.bd', {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
        })

        if ((await page.title()).includes('Security Check')) {
            console.warn('Cloudflare detected — rotating proxy and restarting.')
            await browser.close()
            return scrapeAndUpdate()
        }

        console.log('Connection established with medex.com.bd')

        // Warm cache only once, after verifying connection
        // specific for my API
        await axios.get(`${API_BASE}/update-cache`)
        console.log('🔥 Cache warmed')

        const { data: allProducts } = await axios.get(API_BASE)

        // Filter products that are tablets or capsules
        const products = allProducts.filter((p) => {
            const cat = (p.category || '').toLowerCase()
            return (
                (cat.includes('tablet') || cat.includes('capsule')) &&
                (!p.genericName || !p.strength || !p.brandName) &&
                p.scraped !== true
            )
        })

        console.log(`${products.length} products to scrape`)
        let consecutiveFailures = 0

        for (let i = 0; i < products.length; i++) {
            const product = products[i]
            const cleanName = (product.name || '')
                .split('+')[0]
                .replace(/mg/gi, '')
                .trim()
            const searchUrl = `https://medex.com.bd/search?search=${encodeURIComponent(
                cleanName
            )}`

            try {
                await page.setViewport(
                    VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)]
                )
                await page.setUserAgent(randomUseragent.getRandom())

                await page.goto(searchUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                })
                await humanScroll(page)

                const $search = cheerio.load(await page.content())
                let link = $search('.search-result-row a').first().attr('href')
                if (!link) {
                    console.warn(`⚠️ No result for ${product.name}`)
                    consecutiveFailures = 0
                    continue
                }
                if (link.startsWith('/')) link = `https://medex.com.bd${link}`

                await page.setUserAgent(randomUseragent.getRandom())
                await page.goto(link, {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000,
                })

                // Check for Cloudflare security check
                if ((await page.title()).includes('Security Check')) {
                    console.warn(
                        '🔒 Cloudflare detected — rotating proxy and restarting...'
                    )
                    await browser.close()
                    return scrapeAndUpdate()
                }

                await humanScroll(page)
                await sleep(500 + Math.random() * 500)

                const $ = cheerio.load(await page.content())
                const genericName =
                    $("div[title='Generic Name'] a").text().trim() || null
                const strength =
                    $("div[title='Strength']").text().trim() || null
                const brandName =
                    $("div[title='Manufactured by'] a").text().trim() || null

                if (!genericName && !strength && !brandName) {
                    consecutiveFailures++
                    console.warn(
                        ` [${consecutiveFailures}] empty scrape for ${product.name}`
                    )

                    // restart if too many empty scrapes
                    if (consecutiveFailures >= 3) {
                        console.warn('🔄Too many empty scrapes — restarting')
                        await browser.close()
                        return scrapeAndUpdate()
                    }
                    continue
                }
                consecutiveFailures = 0

                const packInfoText = $('.package-container .pack-size-info')
                    .text()
                    .trim()
                let perPack = null,
                    stripPrice = null
                const m1 = /x\s*(\d+)/i.exec(packInfoText)
                if (m1) perPack = +m1[1]
                else {
                    const m2 = /(\d+)'s pack/i.exec(packInfoText)
                    if (m2) perPack = +m2[1]
                }

                const stripLabel = $('.package-container span').filter(
                    (i, el) => $(el).text().trim() === 'Strip Price:'
                )
                if (stripLabel.length) {
                    const raw = stripLabel.next('span').text().trim() || ''
                    stripPrice = raw.replace(/[৳\s,]/g, '') || null
                } else {
                    const m3 = /:\s*৳\s*([\d\.]+)/.exec(packInfoText)
                    if (m3) stripPrice = m3[1]
                }

                const updatedProduct = {
                    _id: product.id,
                    genericName,
                    strength,
                    brandName,
                    scraped: true,
                    prices: Array.isArray(product.prices)
                        ? product.prices
                        : [{}],
                }
                if (!updatedProduct.prices[0]) updatedProduct.prices[0] = {}
                if (perPack) updatedProduct.prices[0].perWeight = perPack
                if (stripPrice) {
                    updatedProduct.prices[0].price = parseFloat(stripPrice)
                    updatedProduct.prices[0].weight = perPack
                        ? '1 pack'
                        : '1 strip'
                }

                console.log(`
🔍 (${i + 1}/${products.length}) ${product.name} → ${cleanName}`)
                console.log(
                    `${genericName || '—'} | ${strength || '—'} | ${
                        brandName || '—'
                    }`
                )
                console.log(
                    `${perPack || '—'} pcs/pack – ৳${stripPrice || '—'}`
                )

                await axios.put(`${API_BASE}/scrape-update`, updatedProduct)
                console.log('Updated\n────────────────────────────────')

                await sleep(2000 + Math.random() * 3000)
            } catch (err) {
                console.error(` Error on ${product.name}:`, err.message)
                await browser.close()
                return scrapeAndUpdate()
            }
        }

        await browser.close()
        console.log('Done!')
    } catch (err) {
        console.error('Connection failed:', err.message)
        await browser.close()
        return scrapeAndUpdate()
    }
}

scrapeAndUpdate()
