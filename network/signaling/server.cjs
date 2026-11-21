'use strict';
// Signaling only. Game states, decks and commands never pass through this server.
// Deploy behind an HTTPS reverse proxy that supports WebSocket upgrades.
const {PeerServer}=require('peer');
const port=Number(process.env.PORT||9000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const origin=process.env.CROSSFORT_ORIGIN||'https://yarudemorde.github.io';
const server=PeerServer({
  host:'0.0.0.0',port,path:'/crossfort',key:'crossfort',
  proxied:process.env.PROXIED==='true',allow_discovery:false,
  concurrent_limit:200,alive_timeout:30000,expire_timeout:10000,
  corsOptions:{origin,methods:['GET','POST'],credentials:false}
});
server.on('error',()=>console.error('Signaling server error'));
console.log('CROSSFORT signaling listening on port '+port);
