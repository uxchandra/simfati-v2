// Config pm2 untuk server produksi. Jalankan dari folder backend:
//   pm2 start ecosystem.config.cjs
//   pm2 save
// pm2 di Windows tidak bisa menjalankan "npm run start" langsung, jadi Node dijalankan
// dengan tsx sebagai loader (--import tsx). Satu proses saja: kalau lewat CLI tsx,
// tsx membuka proses Node kedua yang di Windows muncul sebagai jendela console.
module.exports = {
  apps: [
    {
      name: "simfati-api",
      cwd: __dirname,
      script: "src/index.ts",
      interpreter: "node",
      node_args: "--import tsx",
      // Restart otomatis kalau crash, tapi jangan restart terus-menerus kalau langsung gagal saat start
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
