module.exports = {
  apps: [{
    name: 'clash_converter',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '100M',
    env: {
      NODE_ENV: 'production',
      PORT: 6060
    },
    env_production: {
      NODE_ENV: 'production'
    }
  }]
}; 