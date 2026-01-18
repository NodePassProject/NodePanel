
<h1 align="center">NodePanel Lightweight Management Panel</h1>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
  </a>
  <img src="https://img.shields.io/github/last-commit/NodePassProject/NodePanel" alt="GitHub last commit">
  <img src="https://img.shields.io/badge/Version-1.0.6-blue.svg" alt="Version 1.0.6">
</p>

This is a frontend management panel powered by [NodePass (yosebyte/nodepass)](https://github.com/yosebyte/nodepass), providing a user-friendly WebUI to manage your NodePass services.

![image](https://i.postimg.cc/KvYVC4yz/2025-06-16-165051.png)
![image](https://i.postimg.cc/GpNCwhWv/2025-06-18-163415.png)

## Demo

1. [Deployed on OpenBSD](https://node-panel.lesliealexander.eu)
2. [Deployed on Vercel](https://node-panel.vercel.app)

## Deployment

<h3>
  Deploy to Vercel
  <img src="https://cdn.jsdelivr.net/gh/HappyLeslieAlexander/OSS/Vercel.png" width="30" height="30" alt="Vercel" style="vertical-align: middle;">
</h3>

Vercel is one of the recommended ways to deploy this frontend panel.

Quick Deployment: <a href="https://vercel.com/new/clone?repository-url=https://github.com/NodePassProject/NodePanel">
  <img src="https://vercel.com/button" alt="Deploy with Vercel" style="display:inline; vertical-align:middle;" />
</a>

Manual Deployment:
>1.  **Fork this repository** (if you haven't already).
>2.  Log in to your [Vercel](https://vercel.com) account.
>3.  Click "New Project".
>4.  Select "Import Git Repository", then choose your forked repository.
>5.  Vercel usually automatically detects this as a Next.js project and configures the build settings. Confirm the settings are correct.
>6.  Click "Deploy".

After deployment, you will get a Vercel domain (e.g., `xxx.vercel.app`), and the frontend panel will be accessible through this domain.

<h3>
  Deploy to Cloudflare Pages
  <img src="https://cdn.jsdelivr.net/gh/HappyLeslieAlexander/OSS/Cloudflare02.png" width="108.2" height="36.8" alt="Cloudflare" style="vertical-align: middle;">
</h3>

Cloudflare Pages provides good support for Next.js applications, allowing them to be deployed to Cloudflare's global edge network for a fast and stable access experience.

#### Steps:

>1. **Fork this repository** (if not already forked).
>2. Log in to your [Cloudflare account](https://dash.cloudflare.com/).
>3. On the dashboard home page, navigate to **Workers & Pages**.
>4. Click **Create application** → Select the **Pages** tab → Click **Connect to Git**.
>5. Select your forked repository and click **Begin setup** to start configuration.
>6. Configuration details:
>
>   * **Project Name**: Keep default or customize;
>   * **Production Branch**: Select `main` or `master` as your primary branch.
>7. In the **Build settings** section:
>
>   * **Framework preset**: `Next.js`;
>   * **Build command**: `npx @cloudflare/next-on-pages@1`;
>   * **Build output directory**: `.vercel/output/static`.
>8. Click **Save and Deploy** to start deployment.
>9. If the build fails, go to "Settings → Runtime → Compatibility flags", enter and select `nodejs_compat`, save, and then **Redeploy**.

After deployment, Cloudflare Pages will assign a `*.pages.dev` domain to your project, e.g., `your-project.pages.dev`. You can access your frontend page through this domain.

## 🙏 Acknowledgments

*   [Yosebyte](https://github.com/yosebyte/) - Core founder of [NodePass](https://github.com/yosebyte/nodepass).
*   All community members who participated in this project.

    [![Contributors](https://contrib.rocks/image?repo=NodePassProject/NodePanel)](https://github.com/NodePassProject/NodePanel/graphs/contributors)

## ⭐ Star

[![Stargazers over time](https://starchart.cc/NodePassProject/NodePanel.svg?variant=adaptive)](https://starchart.cc/NodePassProject/NodePanel)
