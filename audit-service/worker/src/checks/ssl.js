import tls from 'node:tls';

export function runSsl(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') return Promise.resolve({ https: false });

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: u.hostname, port: Number(u.port) || 443, servername: u.hostname, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate();
        const validTo = new Date(cert.valid_to);
        resolve({
          https: true,
          authorized: socket.authorized,
          authorizationError: socket.authorizationError || null,
          protocol: socket.getProtocol(),
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
          validTo: validTo.toISOString(),
          daysUntilExpiry: Math.floor((validTo - Date.now()) / 86_400_000),
        });
        socket.end();
      }
    );
    socket.on('timeout', () => { socket.destroy(); reject(new Error('TLS timeout')); });
    socket.on('error', reject);
  });
}
