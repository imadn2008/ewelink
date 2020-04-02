var app = {
    req: (opt)=> {
      let httpRequest = new XMLHttpRequest();
      httpRequest.onreadystatechange = ()=>{
          if (httpRequest.readyState === XMLHttpRequest.DONE)
              if (httpRequest.status === 200) {
                  opt.callback.call(app,httpRequest.responseText);
              }
      };
      httpRequest.open(opt.method.toUpperCase(), 'proxy.php?url='+encodeURIComponent(opt.url)); //
      if (opt.headers){
          httpRequest.setRequestHeader(opt.headers[0],opt.headers[1] );
      }
      if (opt.method === 'POST'){
          httpRequest.setRequestHeader("Content-Type","application/x-www-form-urlencoded;charset=UTF-8" );
      }
        httpRequest.send(opt.body ? 'data='+JSON.stringify(opt.body) : null );
  }
    ,serialize:(obj)=>{
        var str = "";
        for (var key in obj) {
            if (str !== "") {str += "&";}
            str += key + "=" + encodeURIComponent(obj[key]);
        }
        return str ;
    }
    ,ttl:3600000
    ,config:null
    ,auth:null
    ,deviceslist:null
    ,devices:null
    ,rf_btn:null
    ,wsc:null
    ,hbInterval:null
    ,socket_domain:null
    ,isSocketOpen:false

    ,getAuthHeader:()=> {
        return ['Authorization','Bearer ' + app.auth.at ];
  }

    ,setSocket:()=>{
        if (app.cache.get('socket_domain')){
            app.socket_domain = app.cache.get('socket_domain').url ;
            app.setupWsc() ;
            return ;
        }
        app.req({ method:'GET' , url:'https://'+app.config.region+'-disp.coolkit.cc:8080/dispatch/app',
            headers : app.getAuthHeader()
            ,callback:(res)=>{
                ret = JSON.parse(res) ;
                if (ret.error === 0){
                    app.socket_domain = ret.domain ;
                    app.cache.set('socket_domain',{url:app.socket_domain}) ;
                    app.setupWsc() ;
                }else{
                    app.log('Domain dispatch error '+ res);
                }

            }
        });
    }
    ,setupWsc : ()=> {

      app.wsc = new WebSocket('wss://' + app.socket_domain + ':8080/api/ws');

        app.wsc.onclose =  (e) =>{
            app.log("WebSocket was closed. Reason [%s]", e);
            app.isSocketOpen = false;
            if (app.hbInterval) {
                clearInterval(app.hbInterval);
                app.hbInterval = null;
            }
            alert("Disconnected..");
            app.log("WSC closed . try reconnect ?");
        };

        app.wsc.onopen =  () =>{
            app.wsc_connect();
        };

        app.wsc.onmessage =  (event)=> {
            var message = event.data;

            if (message === 'pong') { return;  }

            app.log("WebSocket messge received: "+ message);

            let json;
            try {
                json = JSON.parse(message);
            } catch (e) {
                return;
            }

            if (json.hasOwnProperty("action")) {
                if (json.action === 'update') {
                    if (json.hasOwnProperty("params") && json.params.hasOwnProperty("switch")) {
                        app.updatePowerStateCharacteristic(json) ;
                    }

                }
            } else if (json.hasOwnProperty('config') && json.config.hb && json.config.hbInterval) {
                if (!app.hbInterval) {
                    app.hbInterval = setInterval( ()=> {   app.wsc_send('ping');  }
                    , json.config.hbInterval * 1000);
                }
            }

        };

        app.wsc.onerror =  (e) =>{
            console.log('WSC Error!', e);
            app.log("WSC error "+ e)
        }
    }
    ,wsc_connect : ()=>{
        app.log('WSC connect');
        app.isSocketOpen = true;

        let payload = {};
        payload.action = "userOnline";
        payload.userAgent = 'app';
        payload.version = 6;
        payload.nonce = app.getNonce();
        payload.apkVesrion = "1.8";
        payload.os = 'ios';
        payload.at = app.auth.at;
        payload.apikey = app.auth.user.apikey;
        payload.ts = app.getTs();
        payload.model = 'iPhone10,6';
        payload.romVersion = '11.1.2';
        payload.sequence = app.getSequence();

        let string = JSON.stringify(payload);

        app.log('Sending login request [%s]'+ string);

        app.wsc_send(string);
    }
    ,wsc_send :(string)=>{
        app.log('WSC Send '+app.wsc.url +' '+ string) ;
        app.wsc.send(string) ;
    }


    ,toggleDevice : (device)=>{

        var deviceid = device.getAttribute('data-deviceid') ;
        var type =  device.getAttribute('data-type') ;
        var apikey =  device.getAttribute('data-apikey') ;

        if (type === 'RF') {

            let channel = device.getAttribute('data-channel') ;

            let params = {
                cmd: 'trigger'
            };
            params["rfTrig"+channel]  = (new Date()).toISOString() ;

            payload = {
                "action":'update',"deviceid" : deviceid,'apikey': apikey,userAgent : 'webapp', ts:0 , sequence : app.getTs(),
                params: params
                ,'from':'device'
            };

            app.trigger(payload, () => {  })

        }else if (type==='RF6'){


            let payload = {
                "action":'update',"deviceid" : deviceid,'apikey': apikey,userAgent : 'webapp' , sequence : app.getTs(),ts:0,
                params: {
                    "cmd": "transmit"
                    , "rfChl": parseInt( device.getAttribute('data-channel') )
                }
                ,tempRec : '' + deviceid
            };

            app.trigger(
                 payload, () => { })

        }else{
            var isOn = device.getAttribute('data-status')=== 'on' ;
            var switchTo = isOn  ? 'off' : 'on' ;

            var payload = { "action":'update',userAgent : 'webapp',"deviceid" : deviceid,'apikey': apikey
                , params : { 'switch' : switchTo  } };

            app.trigger(payload,()=>{
                    device.setAttribute("data-status",switchTo);
            }) ;

        }


    }

    ,trigger : (_payload, callback)=> {

       let  payload = Object.assign({}, _payload);

        let string = JSON.stringify(payload);

        if (app.isSocketOpen) {
            setTimeout(()=> {   app.wsc_send(string);    callback(); }, 1);
        } else {
            callback('Socket was closed. It will reconnect automatically; please retry your command');
        }

    }

    ,updatePowerStateCharacteristic:(json)=>{
        app.$('#device-'+json.deviceid).setAttribute('data-status',json.params.switch) ;
    }

    ,getNonce:()=>{
        return app.rand(10000, 99999)+ app.rand(10000, 99999)+ app.rand(10000, 99999);
    }
    ,getSequence : ()=> {
        return Math.floor((new Date() / 1000) * 1000) ;
    }
    ,getImei:()=>{
        return 'DF7425A0-' + app.rand(1000, 9999) +  '-'+ app.rand(1000, 9999) + '-9F5E-3BC9179E48FB'
    }
    ,getTs:()=>{
       return ''+ Math.floor((new Date() / 1000)) ;
    }
    ,rand:(min,max)=>{
        return Math.floor(Math.random() * max) + min ;
    }


    ,getDevices:()=>{

        var payloads = {
            'lang':"en"
            ,'apiKey':app.auth.user.apikey
            ,'getTags':1,
            'version':6,
            'ts' : 0  , // app.getTs() getSequence ??
            'appid' : app.auth.user.appId,
            'os':'iOS'
            ,'imei':app.getImei()
            ,'model':''
            ,'romVersion':'11.1.2'
            ,'appVersion':'3.5.3'
            ,'nonce': app.getNonce()
        };
        console.log(payloads);
        let uri =  'https://'+ app.config.region+ '-api.coolkit.cc:8080/api/user/device?' + app.serialize(payloads).replace(/&amp;/g,'&') ;//
        app.deviceslist = null ;
        console.log("Cleaning devices list");
        app.req({method:'GET', url: uri , 'headers':app.getAuthHeader()  ,callback:(res)=>{
            app.log("Get devices callback") ;

            ret = JSON.parse(res) ;
            if (ret.error===0) {
                console.log(ret.devicelist);
                app.deviceslist = ret.devicelist ;
                app.mapDevices();
            }else{
                app.log('Retrive devices error '+ res) ;
            }
        }});


    }
    ,mapDevices:()=>{
      let devices = app.deviceslist ;
        app.log("map devices");
        app.devices = new Map();
        app.rf_btn = new Map();

        for(var i=0;i<devices.length;i++){
            let d = devices[i] ;
            if (d.productModel === 'RF_Bridge'){
                let rfDevices = d.tags.zyx_info;
                //for (var j=0;j<d.params.rfList;j++){  }
                for (var $i = 0; $i < rfDevices.length; $i++) {
                    //console.log(rfDevices[$i]);
                    for(var j=0;j< rfDevices[$i].buttonName.length;j++){

                        let btn = rfDevices[$i].buttonName[j] ;
                        let key = Object.keys(btn)[0];
                        let val = Object.values(btn)[0] ;

                        btn.btnType = rfDevices[$i].remote_type == 4 ? 'RF6' : 'RF' ;
                        btn.name    = rfDevices[$i].remote_type == 4 ? val : rfDevices[$i].name ;
                        //btn.trigger = rfDevices[$i].remote_type == 4  ? 'rfChl' : `rfTrig${key}`;
                        btn.channel = rfDevices[$i].remote_type == 4 ? j+1 : key ;

                        btn.deviceid = d.deviceid ;
                        btn.type    = rfDevices[$i].remote_type;

                        btn.apikey= d.apikey;
                        btn.productModel= d.productModel;
                        btn.online= d.online;
                        btn.rssi = Math.round(((100 + d.params.rssi) * 2)/10);
                        app.rf_btn.set(key,btn) ;
                    }
                }

            }else {
                app.devices.set(d.deviceid, {
                    "btnType":'switch',
                    'name': d.name,
                    'deviceid': d.deviceid,
                    'apikey': d.apikey,
                    'model': d.extra.extra.model,
                    'startup': d.params.startup,
                    'switch': d.params.switch, //current state
                    'timers': d.timers,
                    'productModel': d.productModel,
                    'online': d.online,
                    'cmd': 'switch',
                    'rssi': Math.round(((100 + d.params.rssi) * 2)/10)
                });
            }
        }

        app.render();

    }
    ,render:()=>{
        app.log("render");
        app.$('#devices').innerHTML = '' ;
        app.devices.forEach((d)=>{
            var device = `<div id="device-${d.deviceid}" class="device"  data-online="${d.online}" onclick="app.toggleDevice(this);" data-status="${d.switch}" `;
            device += ` data-deviceid="${d.deviceid}" data-type="${d.model}" data-apikey="${d.apikey}"> `;
            device += `<span class="wifi wifi-${d.rssi}"></span>` ;
            device += '<span  class="switch"></span>' + d.name ;
            device += '</div>';
            app.$('#devices').innerHTML += device ;
        });
        app.rf_btn.forEach((d)=>{
            //    console.log(d);
            var device = `<div id="device-${d.deviceid}" data-deviceid="${d.deviceid}" class="device"  data-online="${d.online}" onclick="app.toggleDevice(this);" `;
            device += ` data-type="${d.btnType}" data-apikey="${d.apikey}" data-channel="${d.channel}"> `;
            device += `<span class="wifi wifi-${d.rssi}"></span>` ;
            device += '<div  class="rf-switch">'+d.name +'</div>'  ;
            device += '</div>';
            app.$('#devices').innerHTML += device ;
        });

        app.$('#reloadDevices').style.visibility = 'visible' ;
    }


    ,authProc :()=>    {
      app.log('Login process start') ;
        let $appDetails = {
            'password': app.config.password,
            'version' : '6',
            'ts' :  app.getTs(),
            'nonce' :  app.getNonce(),
            'appid' : 'oeVkj2lYFGnJu5XUtWisfW4utiN4u9Mq',
            'imei' : app.getImei() ,
            'os' : 'iOS',
            'model' : 'iPhone10,6',
            'romVersion' : '11.1.2',
            'appVersion' : '3.5.3'
        };

        if (app.config.phone)
            $appDetails.phoneNumber = app.config.phone;

        if (app.config.email  )    {
            $appDetails['email'] = app.config.email  ;
            delete $appDetails.phoneNumber;
        }

        var hash = CryptoJS.HmacSHA256( JSON. stringify($appDetails)  , '6Nz4n0xA8s8qdxQf2GqurZj2Fs55FUvM');
        var hashInBase64 = CryptoJS.enc.Base64.stringify(hash);

        $response = app.req({method :'POST', url :'https://'+ app.config.region +'-api.coolkit.cc:8080/api/user/login'
            ,'body' : $appDetails , headers: ['Authorization','Sign ' + hashInBase64 ]  ,callback:(res)=>{
                 ret = JSON.parse(res) ;
                if (ret.error){
                    if (ret.error === 301){
                        app.log('Region error! Please change region: '. ret.region) ;
                    }else if(ret.error === 401){
                        app.log('Auth error') ;
                    }else{
                        app.log('Fatal error: '. ret.error )
                    }
                    app.showLoginForm();
                }else {
                    app.hideLoginForm();
                    app.auth = ret ;
                    app.cache.set('auth',ret) ;
                    app.setSocket() ;
                    app.getDevices();

                }
            }
        } );
        return false;
    }

    ,$:(q)=>{
      return document.querySelector(q)
    }

    ,showLoginForm:()=>{
        app.$('#login-form').style.display = 'block' ;
        app.$('#logout').style.visibility = 'hidden' ;
    }
    ,hideLoginForm:()=>{
        app.$('#login-form').style.display = 'none' ;
        app.$('#logout').style.visibility = 'visible' ;

    }

    ,log:(s)=>{
        console.log(s);
        if (typeof s !== "string")
            s = JSON.stringify(s) ;
        app.$('#out').innerHTML += s + "<br>" ;
    }
    ,cache:{
      get:(s)=>{
          if (! localStorageCookie.getItem(s))
              return false ;
         let v = JSON.parse(localStorageCookie.getItem(s) );
         // console.log(s,v.__timestamp, v.__ttl, new Date().getTime() ) ;
        if (new Date().getTime() > v.__timestamp+v.__ttl  ) {
            localStorageCookie.removeItem(s);
            app.log('Cache expired for '+ s);
            return false;
        }
        return v;

      }
      ,set:(k,v,ttl)=>{
          v.__timestamp = new Date().getTime();
          v.__ttl = ttl ? ttl : app.ttl; // live 1 hour
          let vs = JSON.stringify(v) ;
            localStorageCookie.setItem(k,vs) ;
          app.log(k + " cache seted for "+ v.__ttl);
        }
        ,remove:(k)=>{
            localStorageCookie.removeItem(k) ;
        }
    }
    ,logOut:()=>{
        app.cache.remove('conf') ;
        app.cache.remove('auth') ;
        app.$('#devices').innerHTML = '' ;
        app.showLoginForm();

    }
    ,init:()=>{
        if (app.cache.get('conf')){
            app.config = app.cache.get('conf') ;
            if (app.cache.get('auth')){
                app.auth = app.cache.get('auth') ;

                app.setSocket() ;
                app.getDevices();
            }else{
                app.authProc() ;
            }
        }else{
            app.showLoginForm();
        }

        app.$('#login-form').addEventListener('submit',(e)=>{
            e.preventDefault() ;
            app.config = {
                email : app.$('#login-email').value ,
                password :  app.$('#login-pass').value ,
                region : app.$('#region').value
            } ;
            app.ttl = parseInt(app.$('#ttl-ipt').value) > 0 ? parseInt(app.$('#ttl-ipt').value) *60000 : 3600000;

            app.cache.set('conf',app.config) ;
            app.authProc() ;
            return false;
        });

    }
};


app.init();
