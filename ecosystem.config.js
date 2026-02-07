export default {
  apps: [
    {
      name: 'WubuUnblocker',
      script: './src/server.mjs',
      env: {
        PORT: process.env.PORT || 7860,
        NODE_ENV: 'development',
      },
      env_production: {
        PORT: process.env.PORT || 7860,
        NODE_ENV: 'production',
      },
      instances: '2',
      exec_mode: 'cluster',
      max_memory_restart: '8G',
      autorestart: true,
      exp_backoff_restart_delay: 100,
      cron_restart: '0 0 * * *', // Restart daily instead of every 10 mins
      kill_timeout: 3000,
      watch: false,
      node_args: '--max-old-space-size=6144', // 6GB per process
    },
    {
      name: 'WubuUnblocker-src-refresh',
      script: './run-command.mjs',
      args: 'build',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      instances: '1',
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 1000 * 60 * 10,
      kill_timeout: 3000,
      watch: false,
    },
    {
      name: 'WubuUnblocker-cache-clean',
      script: './run-command.mjs',
      args: 'clean',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      instances: '1',
      exec_mode: 'fork',
      autorestart: true,
      restart_delay: 1000 * 60 * 60 * 24 * 7,
      kill_timeout: 3000,
      watch: false,
    },
  ],
};
