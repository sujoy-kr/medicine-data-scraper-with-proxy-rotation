# Medicine Data Scraper with Proxy Rotation

This project is a web scraper using Puppeteer, Cheerio, and Axios.  
It scrapes product details (generic name, strength, brand, price) from medex.com.bd and updates them to an API. It includes proxy rotation, stealth browsing, randomized user agents, human-like scrolling, and auto-restart on Cloudflare blocks.

## Features

-   Stealth mode to bypass bot detection
-   Random proxy, viewport, and user-agent per session
-   Human-like scrolling
-   Auto-restart on failures
-   Targets tablets and capsules only
-   Updates a backend API

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure:

    - Add proxies inside the `PROXIES` array.
    - Set the API base URL in `API_BASE`.

3. Run:

```bash
node script.js
```

## Requirements

-   Node.js
-   Working proxy list
-   API to update data

## Notes

Use responsibly and respect the site's terms. Proxy rotation is required to avoid Cloudflare blocking. This is for educational purpose only. Don't misuse.
