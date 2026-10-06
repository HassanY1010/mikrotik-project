/**
 * PM2 Production Process Manager Configuration
 * MikroTik HotSpot Cards Management SaaS Platform
 */

module.exports = {
  apps: [
    {
      name: 'mikrotik-api',
      script: './apps/api/dist/main.js',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/api-err.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'mikrotik-admin',
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --config apps/admin/vite.config.ts --port 5173 --host 0.0.0.0',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/admin-err.log',
      out_file: './logs/admin-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
