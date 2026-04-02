// PM2 process configuration for running the meme-stealer bot in production.
// PM2 manages the Node.js process, handling auto-restarts and memory limits.
// Start with: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'meme-stealer',
      // Use node directly; args handle TypeScript path resolution and point to the compiled output
      script: 'node',
      args: '-r tsconfig-paths/register .build/src/index.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
