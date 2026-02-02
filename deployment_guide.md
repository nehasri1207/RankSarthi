# Live Hosting Guide: RankSaarthi

To host RankSaarthi live and handle your target of **2000 concurrent users**, follow this recommended setup.

## 1. Recommended Platform
Since you are using **SQLite** (which is a file-based database), you need a platform with **Persistent Storage**.
*   **Best Choice:** VPS (DigitalOcean Droplet, AWS EC2, or Linode). Starting with a 2GB/4GB RAM plan is recommended for high traffic.
*   **Easier Choice:** [Render.com](https://render.com) or [Railway.app](https://railway.app), but you **MUST** attach a "Persistent Disk" to store `ranksaarthi.db`.

---

## 2. Server Setup (VPS)
If using a VPS (Ubuntu), run these commands:

### A. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### B. Use PM2 for 24/7 Uptime
PM2 will keep your server running even if it crashes or the VPS restarts.
```bash
sudo npm install -g pm2
pm2 start server.js --name "ranksaarthi" -i max
pm2 save
pm2 startup
```
> [!TIP]
> Using `-i max` will run the app in "Cluster Mode", using all CPU cores to handle the 2000 users.

---

## 3. Security (HTTPS)
You should never host a live site on `http`. Use **Nginx** and **Certbot** for a free SSL certificate.

### A. Install Nginx
```bash
sudo apt install nginx
```

### B. Setup SSL (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 4. Environment Variables
Create a `.env` file on your server to keep secrets safe:
```env
PORT=3000
ADMIN_PASSWORD=your_secure_password
NODE_ENV=production
```

---

## 5. Performance Tuning
We already enabled **WAL Mode** in the code, which is great. 
*   **Backup:** Since SQLite is one file (`ranksaarthi.db`), you can easily back it up by copying it daily.
*   **Scaling:** If you grow past 5,000 users, consider migrating to **PostgreSQL**.

---

## Ready to go?
1.  **Do you have a domain name purchased?**
2.  **Which hosting provider do you prefer (DigitalOcean, AWS, Render)?**

I can help you prepare the `package.json` for production if you're ready!
