// ============================================
// FILE 3: ecosystem.config.js
// Path: /root/TutorAppServer/ecosystem.config.js
// ============================================

export default {
  apps: [
    {
      name: "tutorApp",
      script: "./index.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 5050,
      },
      error_file: "./logs/error.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 5000,
      wait_ready: false,
    },
  ],
};
