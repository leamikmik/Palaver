//Get .env file
const io = require('@pm2/io')
const path = require('path');
require('dotenv').config();
const fs = require('fs');
//PubSub -> for broadcasting new messages
const PubSub = require('pubsub-js');
//Express, websocket
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const expressWs = require('express-ws')(app, server);
//Generating access tokens + hash
const jwt = require('jsonwebtoken');
const jwtAccSecret = process.env.CH_ACCESS_TOKEN_SECRET; 
const jwtRefSecret = process.env.CH_REFRESH_TOKEN_SECRET; 
const saltNum = Number(process.env.CH_SALTROUNDS);
//Secure cookies, mysql, and other security
const cookieParser = require('cookie-parser');
const mySql = require('mysql');
const bcrypt = require("bcryptjs");
const cors = require("cors");
const validator = require("node-email-validation");
const { v4: uuidv4 } = require('uuid');
const { fstat } = require('fs');
//Domain whitelist + api settings
let whitelist = ['https://chat.mikmik.xyz']
let corsOptionsDelegate = function (req, callback) {
  let corsOptions;
  if (whitelist.indexOf(req.header('Origin')) !== -1) {
    corsOptions = { origin: true , credentials: true} // reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false , credentials: true} // disable CORS for this request
  }
  callback(null, corsOptions) // callback expects two parameters: error and options
}
const dir = __dirname+'/site';
app.use(cookieParser(process.env.CH_COOKIE_SECRET));
app.use(express.json({limit: '10mb'}));
app.use(cors(corsOptionsDelegate));
app.use(express.static(dir));

function getRandomColor() {
    let letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

//Connect db
const db = mySql.createPool({
    host: process.env.CH_DBHOST,
    user: process.env.CH_DBUSER,
    password: process.env.CH_DBPASS,
    database: process.env.CH_DB
})

app.ws('/api/ws',(ws, req)=>{
    let subscriber = (room, data)=>{
        ws.send(data);
    };
    setInterval(()=>{
        ws.send(JSON.stringify({ping: "PING"}))
    }, 60*1000);
    let subscriptions = [];
    let tokens = [];
    let name;
    let pfp;
    //console.log(req.signedCookies)
    jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, res)=>{
        if(err) switch(err['name']){
            case 'TokenExpiredError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
            case 'JsonWebTokenError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
            default: console.log(err); break;
        }
        else{
            db.query('select username, color, pfp, email from User where user_id=?', [res.id], function(err, db_res){
                if(err) console.log(err);
                else if(db_res.length>0){
                    ws.send(JSON.stringify({
                        username: db_res[0]['username'],
                        color: db_res[0]['color'],
                        pfp: db_res[0]['pfp'],
                        email: db_res[0]['email'],
                        type: 'userName'
                    }));
                    name = db_res[0]['username'];
                    pfp = db_res[0]["pfp"];
                }
            });
            db.query("Update User set active = 1 where user_id = ?", [res.id], (err, temp1)=>{
                if(err) console.log(err);
                else{
                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ?',
                    [res.id, res.id], (err, db_res)=>{
                        if(err) console.log(err);
                        else{
                            PubSub.unsubscribe(subscriber);
                            let temp = {rooms:[], type: "joinedRooms"};
                            for(let i=0; i<db_res.length; i++) {
                                subscriptions[i] = db_res[i]['id'];
                                tokens[i] = PubSub.subscribe(db_res[i]['id'], subscriber);
                                PubSub.publish(db_res[i]['id'], JSON.stringify({id: db_res[i]['id'], action: "joined", type: "userAction"}));
                                temp["rooms"][i] = db_res[i];
                            }
                            ws.send(JSON.stringify(temp));
                        }
                    })
                }
            })
            
        }
    });
    ws.on('close', ()=>{
        jwt.verify(req.signedCookies['refreshToken'], jwtRefSecret, (err, res)=>{
            if(err) console.log(err);
            else{
                db.query("Update User set active = 0 where user_id = ?", [res.id], (err)=>{
                    if(err) console.log(err);
                    else{
                        subscriptions.forEach((token)=>{
                            PubSub.publish(token, JSON.stringify({id: token, action: "left", type: "userAction"}));
                    })
                    PubSub.unsubscribe(subscriber);
                    }
                });
            }
        })
    })

    ws.on('message', (msg)=>{
        //console.log(msg)
        const parsedData = JSON.parse(msg) || null;
        jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, res)=>{
            if(err) switch(err['name']){
                case 'TokenExpiredError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
                case 'JsonWebTokenError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
                default: console.log(err); break;
            }else switch(parsedData['type']){
                case "refreshUsers":
                    let temp = {members: [], type: "freshUsers"};
                    db.query("Select pfp, username, color, active from User u join RoomUser ru on ru.user_id=u.user_id where room_id = ? order by active desc, lower(username)", 
                    [parsedData['id']], (err, db_res2)=>{
                        if(err) console.log(err);
                        else{
                            for(let i = 0; i<db_res2.length; i++) temp["members"][i] = db_res2[i];
                            ws.send(JSON.stringify(temp));
                        }
                    })
                    break;
                case "recieved":
                    db.query("Update RoomUser set lastVisited = ? where room_id = ? and user_id = ?", [new Date(Date.now()+3600000).toISOString().slice(0, 19).replace('T', ' '), parsedData['id'], res.id], ()=>{
                        if(err) console.log(err);
                    })
                    break;
                case 'getRoom':{
                    //new Date(Date.now()).toISOString().slice(0, 19).replace('T', ' ')
                    db.query('select m.message_text as msg, m.sent_at, u.username as sender, u.color, u.pfp from Message m' +
                    ' Join User u on m.sender_id=u.user_id' +
                    //' Join Room r on m.room_id=r.room_id' +
                    ' Join RoomUser ru on m.room_id=ru.room_id' +
                    ' Where ru.user_id = ? and ru.room_id = ?' +
                    ' Order by sent_at desc Limit 50' , [res.id, parsedData['id']], (err, db_res)=>{
                        if(err) console.log(err);
                        else db.query("Select inviteCode, r.room_name from RoomUser ru Join Room r on ru.room_id=r.room_id where ru.room_id = ? and user_id = ?",[parsedData['id'], res.id], (err, db_res2)=>{
                            if(err) console.log(err);
                            else
                            db.query("Update RoomUser set lastVisited = ? where room_id = ? and user_id = ?", [new Date(Date.now()+3600000).toISOString().slice(0, 19).replace('T', ' '), parsedData['id'], res.id], ()=>{
                                let temp = {messages:[], members: [], room: parsedData['id'], roomName: db_res2[0]["room_name"], inviteCode: db_res2[0]["inviteCode"], owner: false, type: "getRoom"}
                                db.query("Select * from Room where owner = ? and room_id = ?", [res.id, parsedData['id']], (err, temp1)=>{
                                if(err) console.log(err);
                                else if(temp1.length!=0) {temp['owner'] = true}
                                for(let i = 0; i<db_res.length; i++){
                                    temp['messages'][i] = db_res[i]["msg"] == null ? {newUser: true, sent_at: db_res[i]["sent_at"], sender: db_res[i]["sender"], color: db_res[i]["color"], pfp: db_res[i]["pfp"]} : db_res[i];
                                    temp['messages'][i]["msg"] = db_res[i]["msg"] != null ? temp['messages'][i]["msg"].replaceAll("<", "&#60").replaceAll(">", "&#62") : temp['messages'][i]["msg"];
                                }
                                db.query("Select pfp, username, color, active from User u join RoomUser ru on ru.user_id=u.user_id where room_id = ? order by active desc, lower(username)", [parsedData['id']], (err, db_res2)=>{
                                    if(err) console.log(err);
                                    else{
                                        for(let i = 0; i<db_res2.length; i++) temp["members"][i] = db_res2[i];
                                        ws.send(JSON.stringify(temp));
                                    }
                                })});
                            });
                        })
                    });
                    break;
                }
                case "getMoreRoom":{
                    db.query('select m.message_text as msg, m.sent_at, u.username as sender, u.color, u.pfp from Message m' +
                    ' Join User u on m.sender_id=u.user_id' +
                    ' Join RoomUser ru on m.room_id=ru.room_id' +
                    ' Where ru.user_id = ? and ru.room_id = ?' +
                    ' Order by sent_at desc Limit ?, 50' , [res.id, parsedData['id'], parsedData["times"]*50], (err, db_res)=>{
                        if(err) console.log(err);
                        else{
                            let temp = {messages:[], room: parsedData['id'], type: "getMoreRoom"};
                            for(let i = 0; i<db_res.length; i++){
                                temp['messages'][i] = db_res[i]["msg"] == null ? {newUser: true, sent_at: db_res[i]["sent_at"], sender: db_res[i]["sender"], color: db_res[i]["color"], pfp: db_res[i]["pfp"]} : db_res[i];
                                temp['messages'][i]["msg"] = db_res[i]["msg"] != null ? temp['messages'][i]["msg"].replaceAll("<", "&#60").replaceAll(">", "&#62") : temp['messages'][i]["msg"];
                            }
                            ws.send(JSON.stringify(temp));
                        }
                    })

                    break;
                }
                case 'sendMsg':{
                    db.query("Select u.username as name, u.color, u.pfp, r.room_name as rName From RoomUser ru Join User u on ru.user_id=u.user_id Join Room r on ru.room_id=r.room_id Where ru.room_id = ? and ru.user_id = ?", [parsedData['room'], res.id], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0){ //console.log(db_res)
                            PubSub.publish(parsedData['room'], JSON.stringify({msg: parsedData['msg'].replaceAll("<", "&#60").replaceAll(">", "&#62"), sender: db_res[0]['name'], pfp: db_res[0]['pfp'], color: db_res[0]["color"] , room: parsedData['room'], roomName: db_res[0]["rName"], sent_at: Date(Date.now()), type: "newMsg"})) //io.emit('event', "hii")
                            db.query("Insert into Message (room_id, sender_id, message_text) Value (?, ?, ?)",
                            [parsedData['room'], res.id, parsedData['msg']], (err)=>{
                                if(err) console.log(err);
                                else db.query("Update RoomUser set lastVisited = ? where room_id = ? and user_id = ?", [new Date(Date.now()+3600000).toISOString().slice(0, 19).replace('T', ' '), parsedData['room'], res.id], ()=>{
                                    if(err) console.log(err);
                                })
                            });
                        }
                    });
                    break;
                }
                case 'joinRoom':{
                    db.query("Select * from RoomUser where room_id=(Select room_id from RoomUser where inviteCode=?) and user_id=?", [parsedData['inviteCode'], res.id], (err, temp1)=>{
                        if(temp1.length==0)
                        db.query("Insert into RoomUser (room_id, user_id, joinedBy) Values ((Select ru2.room_id from RoomUser ru2 where ru2.inviteCode=?), ?, ?)", [parsedData['inviteCode'], res.id, parsedData['inviteCode']], (err, db_res)=>{
                            if(err) console.log(err);
                            else {
                                ws.send(JSON.stringify({message: "Joined room", status: 200}));
                                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ?', [res.id, res.id], (err, db_res)=>{
                                    if(err) console.log(err);
                                    else{
                                        PubSub.unsubscribe(subscriber);
                                        let temp = {rooms:[], type: "joinedRooms"};
                                        for(let i=0; i<db_res.length; i++) {
                                            subscriptions[i] = db_res[i]['id'];
                                            tokens[i] = PubSub.subscribe(db_res[i]['id'], subscriber);
                                            temp["rooms"][i] = db_res[i];
                                        }
                                        db.query("insert into Message (room_id, sender_id) values ((Select ru.room_id from RoomUser ru where ru.inviteCode=?), ?)", [parsedData['inviteCode'], res.id], (err, temp2)=>{
                                            if(err) console.log(err);
                                            else{
                                                db.query("Select u.username as name, u.color, u.pfp, ru.room_id as id r.room_name as rName From RoomUser ru Join User u on ru.user_id=u.user_id Join Room r on ru.room_id=r.room_id Where joinedBy = ? and ru.user_id = ?",[parsedData['inviteCode'], res.id],(err, temp3)=>{
                                                    PubSub.publish(temp3[0]["id"], JSON.stringify({newUser: true, sender: temp3[0]['name'], color: temp3[0]["color"], pfp:temp3[0]["pfp"], room: temp3[0]['id'], roomName: db_res[0]["rName"], type: "newMsg"}))
                                                })
                                            }
                                        });
                                        ws.send(JSON.stringify(temp));
                                    }
                                });
                            }
                        });
                    })
                    break;
                }
                case 'createRoom':{
                    let gen_uuid = uuidv4();
                    db.query("Insert into Room (room_id, room_name, owner) Values (?, ?, ?)", [gen_uuid, parsedData['roomName'], res.id], (err, temp1)=>{
                        if(err) console.log(err);
                        else db.query("Insert into RoomUser (room_id, user_id) Values (?, ?)", [gen_uuid, res.id], (err, temp2)=>{
                            if(err) console.log(err);
                            else{
                                ws.send(JSON.stringify({message: "Created room", status: 200}));
                                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ?', [res.id, res.id], (err, db_res)=>{
                                    if(err) console.log(err);
                                    else{
                                        PubSub.unsubscribe(subscriber);
                                        let temp = {rooms:[], type: "joinedRooms"};
                                        for(let i=0; i<db_res.length; i++) {
                                            subscriptions[i] = db_res[i]['id'];
                                            tokens[i] = PubSub.subscribe(db_res[i]['id'], subscriber);
                                            temp["rooms"][i] = db_res[i];
                                        }
                                        ws.send(JSON.stringify(temp));
                                    }
                                });
                            } 
                        })
                    });
                }
                case 'deleteRoom':{
                    db.query("Select * from Room where owner = ? and room_id = ? and room_name = ?", [res.id, parsedData["room"], parsedData["roomName"]], (err, db_res)=>{
                        if(err) console.err;
                        else if(db_res.length>0) db.query("Delete from Room where room_id = ?", [parsedData["room"]], (err, temp)=>{
                            if(err) console.err;
                            else{
                                ws.send(JSON.stringify({message: "Deleted room", status: 200}));
                                PubSub.unsubscribe(parsedData["room"]);
                                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ?', [res.id, res.id], (err, db_res)=>{
                                    if(err) console.log(err);
                                    else{
                                        let temp = {rooms:[], type: "joinedRooms"};
                                        for(let i=0; i<db_res.length; i++) {
                                            tokens[i] = PubSub.subscribe(db_res[i]['id'], subscriber);
                                            temp["rooms"][i] = db_res[i];
                                        }
                                        ws.send(JSON.stringify(temp));
                                    }
                                });
                            }
                        })
                    })
                }
                case 'getInviteCode':{
                    db.query("Select inviteCode from RoomUser where user_id = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0) ws.send(JSON.stringify({inviteCode: db_res[0]["inviteCode"], type: "inviteCode"}));
                    });
                    break;
                }
            }
        })
        
    })
});

app.post("/api/linkType", (req, res)=>{
    jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, res_id)=>{
        if(err) switch(err['name']){
            case 'TokenExpiredError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
            case 'JsonWebTokenError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
            default: console.log(err); break;
        }else{
            fetch(req.body["url"], {method:'HEAD'}).then(
                res_url=>{
                    switch(res_url.headers.get("Content-type").split("/")[0]){
                        case "audio": res.json({parsed: "<br/><audio controls src="+req.body["url"]+" /><br/>"}); break;
                        case "video": res.json({parsed: "<br/><video style='max-width: 80%; max-height: 100%' controls><source onload=\"scrollBottomImg(this)\" src="+req.body["url"]+"></video><br/>"}); break;
                        case "image": res.json({parsed: "<br/><img onload=\"scrollBottomImg(this)\" style='max-width: 80%; max-height: 100%' src="+req.body["url"]+" /><br/>"}); break;
                        default: {res.json({parsed: "<a href="+req.body["url"]+">"+req.body["url"]+"</a>"})}
                    }
                },
                err=>{if(err) res.json({parsed: "<a href="+req.body["url"]+">"+req.body["url"]+"</a>"})}
            )
        }
    })
})

app.post("/api/setSettings", (req, res)=>{
    jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, result)=>{
        db.query("Select password, color, username, pfp From User Where user_id=?", [result.id], (err, db_result)=>{
            if(err) console.log(err);
            else if(db_result.length != 0){
                let temp = req.body;
                temp["username"] = db_result[0]["username"];
                bcrypt.compare(req.body["verifyPass"], db_result[0]['password']).then(crypt_res=>{if(crypt_res){
                    db.query("select user_id from User where username = ?", [req.body["username"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else{
                            if(db_res.length==0 && db_result[0]["username"]!=req.body["username"]) temp["username"] = req.body["username"];
                            if(req.body["pfp"]!=""){
                                if(temp["pfp"]!="https://chat.mikmik.xyz/images/default_user.jpg"){
                                    fs.writeFile("./site/data/pfp/"+result.id+".png", req.body["pfp"].split(",")[1], {encoding: "base64"}, (err)=>{if(err)console.log(err)})
                                    temp["pfp"] = './data/pfp/'+result.id+'.png';
                                }else temp["pfp"] = "./images/default_user.jpg";                                       
                            }else temp["pfp"] = db_result[0]["pfp"];
                            db.query("Update User set username = ?, color = ?, pfp = ? Where user_id = ?", [temp["username"], temp["color"], temp["pfp"], result.id], err=>{
                                if(err)console.log(err);
                                else res.status(200).send("Success");
                            })
                        } 
                    })
                }else res.status(401).send("Incorrect password");
                }) 
            }
        })
    })
})

app.post("/api/auth/logout", (req, res)=>{
    jwt.verify(req.signedCookies['refreshToken'], jwtRefSecret, (err, result)=>{
        if(err) console.log(err);
        else {
            db.query("Delete from RefreshToken Where token = ? and user_id = ?", [req.signedCookies['refreshToken'], result.id], (err)=>{
                if(err) console.log(err);
                else{
                    res.clearCookie("accessToken");
                    res.clearCookie("refreshToken");
                    res.status(200).send("Logout successful");
                }
            })
        }
    })
})

app.post("/api/auth/refreshToken", (req, res)=>{
    jwt.verify(req.signedCookies['refreshToken'], jwtRefSecret, (err, result)=>{
        if(err) switch(err['name']){
            case 'TokenExpiredError': res.status(401).send("Expired refresh token"); break;
            case 'JsonWebTokenError': res.status(401).send("Expired refresh token"); break;
            default: console.log(err); break;
        }
        else{
            let genAccessTok = jwt.sign({id: result.id}, jwtAccSecret, {expiresIn: '10m'});
            let genRefreshTok = jwt.sign({id: result.id}, jwtRefSecret, {expiresIn: '7d'});
            //console.log(genRefreshTok + " " + req.signedCookies['refreshToken'])
            db.query("Delete from RefreshToken Where token = ? and user_id = ?", [req.signedCookies['refreshToken'], result.id], (err, temp1)=>{
                if(err) console.log(err);
                else db.query("Insert Into RefreshToken Value (?, ?, Date_Add(now(), INTERVAL 1 week) )", [result.id, genRefreshTok], (err, temp2)=>{ 
                    if(err) console.log(err);
                    else{
                        res.cookie('accessToken', genAccessTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
                        res.cookie('refreshToken', genRefreshTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
                        res.send("cookie");
                    }
                });
            })
            
        }
    })
})

app.post("/api/auth/register", (req, res)=>{
    if(req.signedCookies['refreshToken']){
        jwt.verify(req.signedCookies['refreshToken'], jwtRefSecret, (err, result)=>{
            if(err) console.log(err);
            else db.query("Delete from RefreshToken Where token = ? and user_id = ?", [req.signedCookies['refreshToken'], result.id], (err)=>{
                if(err) console.log(err);
            })
        });
    }
    if(req.body.username != "" && validator.is_email_valid(req.body.email) && req.body.password != ""){
        db.query("Select * From User Where username=? or email=?", [req.body.username, req.body.email], (err, db_result)=>{
            if(err) console.log(err);
            else if(db_result.length == 0){
                bcrypt.genSalt(saltNum, (err,salt)=>{
                    if(err) console.log(err);
                    bcrypt.hash(req.body.password, salt, (err, hash)=>{
                        if(err) console.log(err);
                        let color = getRandomColor();
                        db.query("Insert into User (username, email, password, color) Values (?, ?, ?, ?)", [req.body.username, req.body.email, hash, color], (err, temp)=>{
                            if(err) console.log(err);
                            else db.query("Select user_id from User where username=? and email=?", [req.body.username, req.body.email], (err, userDb)=>{
                                if(err) console.log(err);
                                else{
                                    let genAccessTok = jwt.sign({id: userDb[0]['user_id']}, jwtAccSecret, {expiresIn: '10m'});
                                    let genRefreshTok = jwt.sign({id: userDb[0]['user_id']}, jwtRefSecret, {expiresIn: '7d'});
                                    db.query("Insert Into RefreshToken Value (?, ?, Date_Add(now(), INTERVAL 1 week) )", [userDb[0]['user_id'], genRefreshTok]);
                                    res.cookie('accessToken', genAccessTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
                                    res.cookie('refreshToken', genRefreshTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
                                    res.status(200).send("Register successful");
                                }
                            })
                        });
                    })
                })
            }
            else if(db_result[0]['email']==req.body.email) res.status(406).send('Email already taken');
            else if(db_result[0]['username']==req.body.username) res.status(409).send('Username already taken');
            })
        }
    }
)

app.post("/api/auth/login", (req, res)=>{
    /* bcrypt.genSalt(saltNum, async (err,salt)=>{
        if(err) console.log(err);
        bcrypt.hash(req.body.password, salt,function(err, hash){
            if(err) console.log(err);
            console.log(hash);
        })
    })*/
    if(req.signedCookies['refreshToken']){
        jwt.verify(req.signedCookies['refreshToken'], jwtRefSecret, (err, result)=>{
            if(err) console.log(err);
            else{
                db.query("Delete from RefreshToken Where token = ? and user_id = ?", [req.signedCookies['refreshToken'], result.id], (err)=>{
                    if(err) console.log(err);
                })
            }
        });
    }
    if(req.body.password != "" && req.body.username != ""){
        db.query("Select password, user_id From User Where username=?", [req.body.username], (err, db_result)=>{
            if(err) console.log(err);
            else if(db_result.length != 0){
                bcrypt.compare(req.body.password, db_result[0]['password']).then(crypt_res=>{
                    if(crypt_res){
                        let genAccessTok = jwt.sign({id: db_result[0]['user_id']}, jwtAccSecret, {expiresIn: '10m'});
                        let genRefreshTok = jwt.sign({id: db_result[0]['user_id']}, jwtRefSecret, {expiresIn: '7d'});
                        db.query("Insert Into RefreshToken Value (?, ?, Date_Add(now(), INTERVAL 1 week) )", [db_result[0]['user_id'], genRefreshTok]);
                        res.cookie('accessToken', genAccessTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
                        res.cookie('refreshToken', genRefreshTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
                        res.status(200).send("Login successful");
                    }else{
                        res.status(401).send("Incorrect password");
                    }
                })
            } else res.status(401).send("User not found")
        })
    }
    
});

app.get('/', (req, res)=>{
    res.sendFile(path.join(dir, 'index.html'));
    
})

app.get('/login', (req, res)=>{
    res.sendFile(path.join(dir, 'login.html'));
})

server.listen(3001, ()=> {
	console.log("Chat up");
    
});

io.init({
    transactions: true // will enable the transaction tracing
})
