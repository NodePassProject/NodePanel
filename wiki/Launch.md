# 快速开始

这篇wiki旨在帮助您入门NodePanel，让我们开始吧！

## Step 1: 添加主控连接

取得一个 NodePass 主控 API ，如果您尚未拥有，可以使用 [NodePass 部署脚本(NodePassProject/npsh)](https://github.com/NodePassProject/npsh) 在诸多 GNU/Linux 发行版中快速部署一个主控 API

![image](https://i.postimg.cc/XJSKc1nF/2025-06-16-171134.png)

使用浏览器打开一个部署好的 NodePanel

如果您尚未添加过任何主控 API 连接，您将在主页面看到蓝色的“添加首个主控连接按钮”。点击此按钮，然后在配置页面中输入您的主控 API 连接信息并保存配置

![image](https://i.postimg.cc/NGPM39rC/2025-06-15-233530.png)

您亦可使用位于页面右上角的主控管理添加主控 API 连接或进行更多操作

![image](https://i.postimg.cc/MK7GvsFN/2025-06-15-233459.png)

⚠注意：如果您的 NodePass 主控 API 通过 HTTPS 提供服务但使用自签名证书，浏览器会阻止连接，您可以在浏览器中直接访问您的 NodePass 主控的 API URL 并在安全警告页面中选择高级--继续前往，此时 NodePanel 即可连接到您的主控 API 并与之交互

![image](https://i.postimg.cc/MK7GvsFN/2025-06-15-233459.png)

## Step 2：创建实例

确保您已添加两个或更多主控 API

单击蓝色的“创建新实例”按钮以构建NodePass转发隧道

现在，您可以可视化地配置您的实例

![image](https://i.postimg.cc/65qXNMNC/2025-06-16-173325.png)