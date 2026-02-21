import fs from 'fs';
let content = fs.readFileSync('src/server.mjs', 'utf8');

content = content.replace(/'stuff', 'games'/g, "'home', 'games'");
content = content.replace(/reply\.redirect\('\/stuff'\);/g, "reply.redirect('/home');");
content = content.replace(/Stuff Route/g, "Home Route");
content = content.replace(/\+ 'stuff',/g, "+ 'home',");
content = content.replace(/views\/stuff\.html/g, "views/home.html");
content = content.replace(/Stuff page not found/g, "Home page not found");

fs.writeFileSync('src/server.mjs', content);
console.log('Replaced stuff with home in server.mjs');
