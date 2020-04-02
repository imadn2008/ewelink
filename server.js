const express = require('express');
const app = express();
const path = require('path');
const XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.all('/proxy.php', function (req, res) {
    let url = req.query.url ;
    let httpRequest = new XMLHttpRequest();
    httpRequest.onreadystatechange = ()=>{
        if (httpRequest.readyState === 4)
            if (httpRequest.status === 200) {
                res.send(httpRequest.responseText);
            }
    };
    httpRequest.open(req.method, url);
    if (req.headers.authorization){
        httpRequest.setRequestHeader('Authorization',req.get('Authorization') );
    }
    let body = (Object.keys(req.body).length === 0) ? null : req.body.data  ;
    httpRequest.send(  body );
});

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});
app.get('/*.css', function (req, res) {
    res.sendFile(path.join(__dirname + req.url));
});
app.get('/*.js', function (req, res) {
    res.sendFile(path.join(__dirname + req.url));
});

app.listen(8080);

