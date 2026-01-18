# Quick Start

This wiki aims to help you get started with NodePanel. Let's begin!

## Step 1: Add Master Connection

Obtain a NodePass Master API. If you don't have one yet, you can use the [NodePass Deployment Script (NodePassProject/npsh)](https://github.com/NodePassProject/npsh) to quickly deploy a Master API on various GNU/Linux distributions.

![image](https://i.postimg.cc/XJSKc1nF/2025-06-16-171134.png)

Open a deployed NodePanel in your browser.

If you haven't added any Master API connections yet, you will see a blue "Add First Master Connection" button on the main page. Click this button, then enter your Master API connection information on the configuration page and save the settings.

![image](https://i.postimg.cc/NGPM39rC/2025-06-15-233530.png)

You can also use the Master Management located in the top right corner of the page to add Master API connections or perform more operations.

![image](https://i.postimg.cc/MK7GvsFN/2025-06-15-233459.png)

⚠ Note: If your NodePass Master API is served over HTTPS but uses a self-signed certificate, the browser will block the connection. You can directly access your NodePass Master API URL in the browser and select "Advanced" -- "Proceed" on the security warning page. After this, NodePanel will be able to connect and interact with your Master API.

![image](https://i.postimg.cc/MK7GvsFN/2025-06-15-233459.png)

## Step 2: Create Instance

Ensure you have added two or more Master APIs.

Click the blue "Create New Instance" button to build a NodePass forwarding tunnel.

Now, you can visually configure your instance.

![image](https://i.postimg.cc/65qXNMNC/2025-06-16-173325.png)
