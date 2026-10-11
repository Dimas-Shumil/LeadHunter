module.exports = {
  apps: [
    {
      name: "lead-hunter-api",
      cwd: __dirname,
      script: "src/server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "lead-hunter-worker",
      cwd: __dirname,
      script: "src/worker.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "500M",
      env: { NODE_ENV: "production" },
    },
  ],
};
