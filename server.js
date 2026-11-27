const app = require('./app');

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Start with another port: PORT=3200 npm run dev`);
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});
