const dgram = require('dgram');

const client = dgram.createSocket('udp4');
const message = Buffer.from(JSON.stringify({
    content: "UDP TEST ALERT: System check in progress.",
    from: "UDP_TEST_PROBE",
    token: "INTERNAL_UDP_SECRET"
}));

client.send(message, 9000, 'localhost', (err) => {
    if (err) {
        console.error('UDP send error:', err);
    } else {
        console.log('UDP test packet sent to port 9000');
    }
    client.close();
});
