import http from 'node:http';

let loggedIn = false;

function page(body) {
  return `<!doctype html><html><body>${body}</body></html>`;
}

const server = http.createServer((req,res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('content-type','text/html; charset=utf-8');

  if (url.pathname === '/') {
    res.end(page(`<h1>Crew Fixture</h1><a href="/login">Login</a> <a href="/dashboard">Dashboard</a>`));
    return;
  }
  if (url.pathname === '/login' && req.method === 'GET') {
    res.end(page(`<h1>Login</h1><form method="POST"><button type="submit">Sign in</button></form>`));
    return;
  }
  if (url.pathname === '/login' && req.method === 'POST') {
    loggedIn = true;
    res.statusCode = 302; res.setHeader('location','/dashboard'); res.end(); return;
  }
  if (url.pathname === '/dashboard') {
    if (!loggedIn) { res.statusCode=302; res.setHeader('location','/login'); res.end(); return; }
    res.end(page(`<h1>Dashboard</h1><form method="POST" action="/logout"><button type="submit">Logout</button></form>`));
    return;
  }
  if (url.pathname === '/logout' && req.method === 'POST') {
    // INTENTIONAL E2E BUG: session is not cleared.
    res.statusCode=302; res.setHeader('location','/dashboard'); res.end(); return;
  }
  res.statusCode=404; res.end(page('<h1>Not Found</h1>'));
});

server.listen(process.env.PORT || 4173, '127.0.0.1', () => {
  console.log(`fixture listening on http://127.0.0.1:${process.env.PORT || 4173}`);
});
