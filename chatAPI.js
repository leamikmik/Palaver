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
const {formidable} = require('formidable');
//Generating access tokens + hash
const jwt = require('jsonwebtoken');
const jwtAccSecret = process.env.CH_ACCESS_TOKEN_SECRET; 
const jwtRefSecret = process.env.CH_REFRESH_TOKEN_SECRET; 
const saltNum = Number(process.env.CH_SALTROUNDS);
const encryptSecret = process.env.CH_ENCRYPTION_SECRET; 
//Secure cookies, mysql, and other security
const cookieParser = require('cookie-parser');
const mySql = require('mysql');
const bcrypt = require("bcryptjs");
const cors = require("cors");
const validator = require("node-email-validation");
const { v4: uuidv4 } = require('uuid');
const { fstat } = require('fs');
//Encryption
const crypto = require("crypto");
const { LogExit } = require('concurrently');

class Encrypter {
  constructor(encryptionKey) {
    this.algorithm = "aes-192-cbc";
    this.key = crypto.scryptSync(encryptionKey, "salt", 24);
  }

  encrypt(clearText) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = cipher.update(clearText, "utf8", "hex");
    return [
      encrypted + cipher.final("hex"),
      Buffer.from(iv).toString("hex"),
    ].join("|");
  }

  decrypt(encryptedText) {
    const [encrypted, iv] = encryptedText.split("|");
    if (!iv) throw new Error("IV not found");
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(iv, "hex")
    );
    return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
  }
}
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
app.use(express.json({limit: '20mb'}));
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
    
    setInterval(()=>{
        ws.send(JSON.stringify({ping: "PING"}))
    }, 60*1000);
    
    let subscriptions = [];
    let tokens = [];
    let subscriber;
    
    //console.log(req.signedCookies)
    jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, res)=>{
        if(err) switch(err['name']){
            case 'TokenExpiredError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
            case 'JsonWebTokenError': ws.send(JSON.stringify({errorMessage: "Expired access token", statusCode: 401})); break;
            default: console.log(err); break;
        }
        else{
            subscriber = (room, data)=>{
                switch(JSON.parse(data)["type"]){
                    case "clearChat":{
                        PubSub.unsubscribe(subscriber);
                        db.query('select r.room_id as id from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and ru2.status=1',[res.id],(err, db_res)=>{
                            if(err) console.log(err);
                            subscriptions = [];
                            tokens = [];
                            for(let i=0; i<db_res.length; i++) {
                                subscriptions[i] = db_res[i]['id'];
                                tokens.push(PubSub.subscribe(db_res[i]['id'], subscriber));
                                tokens.push(PubSub.subscribe(db_res[i]['id']+":"+res.id, subscriber));
                            }
                            ws.send(data);
                        });
                        break;
                    }
                    default: ws.send(data);
                }
            };
            setInterval(()=>{
                db.query('select r.room_id as id from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and ru2.status=1',[res.id],(err, db_res)=>{
                    if(err) console.log(err);
                    PubSub.unsubscribe(subscriber);
                    subscriptions = [];
                    tokens = [];
                    for(let i=0; i<db_res.length; i++) {
                        subscriptions[i] = db_res[i]['id'];
                        tokens.push(PubSub.subscribe(db_res[i]['id'], subscriber));
                        tokens.push(PubSub.subscribe(db_res[i]['id']+":"+res.id, subscriber));
                    }
                    db.query("Update User set active = 1 where user_id = ?", [res.id]);
                });
            }, 5*60*1000);
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
                }
            });
            db.query("Update User set active = 1 where user_id = ?", [res.id], (err, temp1)=>{
                if(err) console.log(err);
                else{
                db.query('select r.room_name as name, r.room_id as id, '+
                '(Select count(m.msg_id) from Message m where m.room_id = id and '+
                '(m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg '+
                'from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and status=1 order by newMsg desc, ru2.lastVisited desc',
                    [res.id, res.id], (err, db_res)=>{
                        if(err) console.log(err);
                        else{
                            PubSub.unsubscribe(subscriber);
                            let temp = {
                                rooms: [],
                                type: "joinedRooms"
                            };
                            subscriptions = [];
                            tokens = [];
                            for(let i=0; i<db_res.length; i++) {
                                subscriptions[i] = db_res[i]['id'];
                                tokens.push(PubSub.subscribe(db_res[i]['id'], subscriber));
                                tokens.push(PubSub.subscribe(db_res[i]['id']+":"+res.id, subscriber));
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
            if(!err){
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
                case "refreshData": // {id: roomid}
                    let temp = {members: [], rooms:[], type: "freshData", id: parsedData["id"], owner: false};
                    db.query("Select u.user_id as id, pfp, username, color, active, if(status='Banned', true, false) as banned from User u join RoomUser ru on ru.user_id=u.user_id where room_id = ? and status != 2 order by active desc, lower(username)", 
                    [parsedData['id']], (err, db_res)=>{
                        if(err) console.log(err);
                        else db.query("Select owner From Room where room_id = ?", [parsedData["id"]], (err, db_res2)=>{
                            if(err)console.log(err);
                            else if(db_res2[0]["owner"]==res.id) temp["owner"] = true;
                            for(let i = 0; i<db_res.length; i++){
                                temp["members"][i] = db_res[i];
                                if(db_res[i]["id"]==db_res2[0]["owner"]) temp["members"][i]["owner"] = true;
                            }
                            db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and ru2.status=1 order by newMsg desc, ru2.lastVisited desc', [res.id, res.id], (err, db_res)=>{
                                if(err) console.log(err);
                                else{
                                    for(let i=0; i<db_res.length; i++) {
                                        temp["rooms"][i] = db_res[i];
                                    }
                                    ws.send(JSON.stringify(temp));
                                }
                            });
                        })
                    });
                    break;
                case "recieved":
                    db.query("Update RoomUser set lastVisited = ? where room_id = ? and user_id = ?", [new Date(Date.now()+3600000).toISOString().slice(0, 19).replace('T', ' '), parsedData['id'], res.id], ()=>{
                        if(err) console.log(err);
                    })
                    break;
                case 'getRoom':{ // {id: roomid}
                    db.query('select m.message_text as msg, m.msg_id as id, m.sent_at, u.username as sender, u.color, u.pfp, if(?=m.sender_id, "true", "false") as msgOwner from Message m' +
                    ' Join User u on m.sender_id=u.user_id' +
                    //' Join Room r on m.room_id=r.room_id' +
                    ' Join RoomUser ru on m.room_id=ru.room_id' +
                    ' Where ru.user_id = ? and ru.room_id = ?' +
                    ' Order by sent_at desc Limit 50' , [res.id, res.id, parsedData['id']], (err, db_res)=>{
                        if(err) console.log(err);
                        else db.query("Select inviteCode, r.room_name from RoomUser ru Join Room r on ru.room_id=r.room_id where ru.room_id = ? and user_id = ? and status=1",[parsedData['id'], res.id], (err, db_res2)=>{
                            if(err) console.log(err);
                            else
                            db.query("Update RoomUser set lastVisited = ? where room_id = ? and user_id = ? and status=1", [new Date(Date.now()+3600000).toISOString().slice(0, 19).replace('T', ' '), parsedData['id'], res.id], ()=>{
                                let temp = {messages:[], members: [], room: parsedData['id'], roomName: db_res2[0]["room_name"], inviteCode: db_res2[0]["inviteCode"], owner: false, type: "getRoom"}
                                db.query("Select owner, secure from Room where room_id = ?", [parsedData['id']], (err, temp1)=>{
                                    if(err) console.log(err);
                                    else if(temp1[0]["owner"]==res.id) {temp['owner'] = true}
                                    let enc;
                                    if(temp1[0]["secure"]){enc = new Encrypter(encryptSecret+parsedData['id']);}
                                    for(let i = 0; i<db_res.length; i++){
                                        temp['messages'][i] = db_res[i]["msg"] == null ? {newUser: true, sent_at: db_res[i]["sent_at"], sender: db_res[i]["sender"], color: db_res[i]["color"], pfp: db_res[i]["pfp"], msgOwner: temp["owner"], id: db_res[i]["id"]} : db_res[i];
                                        if(temp["owner"]) temp['messages'][i]["msgOwner"] = "true";
                                        temp['messages'][i]["msg"] = db_res[i]["msg"] != null ? (temp1[0]["secure"] ? enc.decrypt(temp['messages'][i]["msg"]) : temp['messages'][i]["msg"]).replaceAll("<", "&#60").replaceAll(">", "&#62") : temp['messages'][i]["msg"];
                                    }
                                    db.query("Select u.user_id as id, pfp, username, color, active, if(status='Banned', true, false) as banned from User u join RoomUser ru on ru.user_id=u.user_id where room_id = ? and status!=2 order by active desc, lower(username)", [parsedData['id']], (err, db_res2)=>{
                                        if(err) console.log(err);
                                        else{
                                            for(let i = 0; i<db_res2.length; i++){
                                                temp["members"][i] = db_res2[i];
                                                if(temp1[0]["owner"]==db_res2[i]["id"]) temp["members"][i]["owner"]=true;
                                            }
                                            ws.send(JSON.stringify(temp));
                                        }
                                    })
                                });
                            });
                        })
                    });
                    break;
                }
                case "getMoreRoom":{// {id: roomid, times: num}
                    db.query('select m.message_text as msg, m.msg_id as id, m.sent_at, u.username as sender, u.color, u.pfp, if(?=m.sender_id, "true", "false") as msgOwner from Message m' +
                    ' Join User u on m.sender_id=u.user_id' +
                    //' Join Room r on m.room_id=r.room_id' +
                    ' Join RoomUser ru on m.room_id=ru.room_id' +
                    ' Where ru.user_id = ? and ru.room_id = ?' +
                    ' Order by sent_at desc Limit ?, 50' , [res.id, res.id, parsedData['id'], parsedData["times"]*50], (err, db_res)=>{
                        if(err) console.log(err);
                        else db.query("Select secure, owner from Room where room_id = ?", [parsedData['id']], (err, temp1)=>{
                            if(err) console.log(err);
                            let temp = {
                                messages: [], 
                                room: parsedData['id'], 
                                type: "getMoreRoom",
                                owner: temp1[0]["owner"]==res.id
                            };                            
                            let enc
                            if(temp1[0]["secure"]) enc = new Encrypter(encryptSecret+parsedData['id']);
                            for(let i = 0; i<db_res.length; i++){
                                temp['messages'][i] = db_res[i]["msg"] == null ? {newUser: true, sent_at: db_res[i]["sent_at"], sender: db_res[i]["sender"], color: db_res[i]["color"], pfp: db_res[i]["pfp"]} : db_res[i];
                                temp['messages'][i]["msg"] = db_res[i]["msg"] != null ? (temp1[0]["secure"] ? enc.decrypt(temp['messages'][i]["msg"]) : temp['messages'][i]["msg"]).replaceAll("<", "&#60").replaceAll(">", "&#62") : temp['messages'][i]["msg"];
                                if(temp["owner"]) temp['messages'][i]["msgOwner"] = "true";
                            }
                            ws.send(JSON.stringify(temp));
                        });
                    })

                    break;
                }
                case 'sendMsg':{// {msg: text, room: roomid}
                    db.query("Select u.username as name, u.color, u.pfp, r.room_name as rName, r.secure From RoomUser ru Join User u on ru.user_id=u.user_id Join Room r on ru.room_id=r.room_id Where ru.room_id = ? and ru.user_id = ?", [parsedData['room'], res.id], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0){ //console.log(db_res)
                            let msg = parsedData['msg'];
                            if(db_res[0]["secure"]){
                                let enc = new Encrypter(encryptSecret+parsedData["room"]);
                                msg = enc.encrypt(msg);
                            }
                            PubSub.publish(parsedData['room'], JSON.stringify({msg: parsedData['msg'].replaceAll("<", "&#60").replaceAll(">", "&#62"), sender: db_res[0]['name'], pfp: db_res[0]['pfp'], color: db_res[0]["color"] , room: parsedData['room'], roomName: db_res[0]["rName"], sent_at: Date(Date.now()), type: "newMsg"})) //io.emit('event', "hii")
                            db.query("Insert into Message (room_id, sender_id, message_text) Value (?, ?, ?)",
                            [parsedData['room'], res.id, msg], (err)=>{
                                if(err) console.log(err);
                                else db.query("Update RoomUser set lastVisited = ? where room_id = ? and user_id = ?", [new Date(Date.now()+3600000).toISOString().slice(0, 19).replace('T', ' '), parsedData['room'], res.id], ()=>{
                                    if(err) console.log(err);
                                })
                            });
                        }
                    });
                    break;
                }
                case "deleteMsg":{ // {id: msgId}
                    db.query("Select m.room_id from Message m Join Room r On m.room_id=r.room_id Join RoomUser ru on m.room_id=ru.room_id where msg_id=? and ((ru.user_id=? and ru.status=1) or owner=?)", [parsedData["id"], res.id, res.id], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0){
                            db.query("Delete from Message where msg_id=?", [parsedData["id"]]);
                            PubSub.publish(db_res[0]["room_id"], JSON.stringify({type: "userAction", action: "msgDelete", id: db_res[0]["room_id"], msgId: parsedData["id"]}));
                        }
                    });
                    break;
                }
                case 'joinRoom':{ // {inviteCode: uuid}
                    db.query("Select status from RoomUser where room_id=(Select room_id from RoomUser where inviteCode=?) and user_id=?", [parsedData['inviteCode'], res.id], (err, temp1)=>{
                        if(err) console.log(err);
                        if(temp1.length==0 || temp1[0]["status"]=="Out" || temp1[0]["status"]=="")
                        db.query(temp1.length>0 ? "Update RoomUser ru set status=1, joinedBy = ? where user_id = ? and ru.room_id=(Select ru2.room_id from RoomUser ru2 where ru2.inviteCode=?)" : "Insert into RoomUser (room_id, user_id, joinedBy) Values ((Select ru2.room_id from RoomUser ru2 where ru2.inviteCode=?), ?, ?)", [parsedData['inviteCode'], res.id, parsedData['inviteCode']], (err, db_res)=>{
                            if(err) console.log(err);
                            else {
                                ws.send(JSON.stringify({message: "Joined room", status: 200}));
                                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and ru2.status=1 order by newMsg desc, ru2.lastVisited desc', [res.id, res.id], (err, db_res)=>{
                                    if(err) console.log(err);
                                    else{
                                        PubSub.unsubscribe(subscriber);
                                        subscriptions = [];
                                        tokens = [];
                                        let temp = {
                                            newRoom: true, 
                                            rooms: [], 
                                            type: "joinedRooms"
                                        };
                                        for(let i=0; i<db_res.length; i++) {
                                            subscriptions[i] = db_res[i]['id'];
                                            tokens.push(PubSub.subscribe(db_res[i]['id'], subscriber));
                                            tokens.push(PubSub.subscribe(db_res[i]['id']+":"+res.id, subscriber));
                                            temp["rooms"][i] = db_res[i];
                                        }
                                        db.query("Insert into Message (room_id, sender_id) values ((Select ru.room_id from RoomUser ru where ru.inviteCode=?), ?)", [parsedData['inviteCode'], res.id], (err, temp2)=>{
                                            if(err) console.log(err);
                                            else{
                                                db.query("Select u.username as name, u.color, u.pfp, ru.room_id as id, r.room_name as rName From RoomUser ru Join User u on ru.user_id=u.user_id Join Room r on ru.room_id=r.room_id Where joinedBy = ? and ru.user_id = ? and ru.status=1",[parsedData['inviteCode'], res.id],(err, temp3)=>{
                                                    if(err) console.log(err);
                                                    else PubSub.publish(temp3[0]["id"], JSON.stringify({newUser: true, sender: temp3[0]['name'], color: temp3[0]["color"], pfp:temp3[0]["pfp"], room: temp3[0]['id'], roomName: db_res[0]["rName"], type: "newMsg"}))
                                                })
                                            }
                                        });
                                        ws.send(JSON.stringify(temp));
                                    }
                                });
                            }
                        });
                        else if(temp1[0]["status"]=="Banned"){
                            ws.send(JSON.stringify({statusCode: 403, msg: "You have been banned from this room."}))
                        } 
                    })
                    break;
                }
                case 'leaveRoom':{ // {room: roomid}
                    db.query("Select owner from Room where room_id = ?", [parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res[0]["owner"]!=res.id){
                            db.query("Update RoomUser set status=2 where room_id = ? and user_id = ?", [parsedData["room"], res.id]);
                            ws.send(JSON.stringify({type: "clearChat", room: parsedData["room"]}));
                        }
                    })
                    break;
                }
                case 'createRoom':{// {roomName: text, expires: date, secure: bool}
                    let gen_uuid = uuidv4();
                    db.query("Insert into Room (room_id, room_name, owner, expires, secure) Values (?, ?, ?, ?, ?)", [gen_uuid, parsedData['roomName'], res.id, parsedData["expires"], parsedData["secure"]], (err, temp1)=>{
                        if(err) console.log(err);
                        else db.query("Insert into RoomUser (room_id, user_id) Values (?, ?)", [gen_uuid, res.id], (err, temp2)=>{
                            if(err) console.log(err);
                            else{
                                ws.send(JSON.stringify({message: "Created room", status: 200}));
                                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and ru2.status=1 order by newMsg desc, ru2.lastVisited desc', [res.id, res.id], (err, db_res)=>{
                                    if(err) console.log(err);
                                    else{
                                        PubSub.unsubscribe(subscriber);
                                        let temp = {
                                            type: "joinedRooms", 
                                            rooms:[], 
                                            newRoom: true
                                        };
                                        subscriptions = [];
                                        tokens = [];
                                        for(let i=0; i<db_res.length; i++) {
                                            subscriptions[i] = db_res[i]['id'];
                                            tokens.push(PubSub.subscribe(db_res[i]['id'], subscriber));
                                            tokens.push(PubSub.subscribe(db_res[i]['id']+":"+res.id, subscriber));
                                            temp["rooms"][i] = db_res[i];
                                        }
                                        ws.send(JSON.stringify(temp));
                                    }
                                });
                            } 
                        })
                    });
                }
                case 'renameRoom':{// {room: roomid, newName: name}
                    db.query("Select room_id from Room where owner = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err)
                        else if(db_res.length>0) db.query("Update Room set room_name = ? where room_id = ?", [parsedData["newName"], parsedData["room"]], (err)=>{
                            if(err) console.log(err);
                            else{
                                PubSub.publish(parsedData["room"], JSON.stringify({type: "userAction", action: "roomRename", id: parsedData["room"]}))
                            }
                        })
                    })
                    break;
                }
                case 'deleteRoom':{ // {room: id}
                    db.query("Select room_id from Room where owner = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.err;
                        else if(db_res.length>0) db.query("Delete from Room where room_id = ?", [parsedData["room"]], (err, temp)=>{
                            if(err) console.err;
                            else{
                                ws.send(JSON.stringify({type: "roomDeleted"}));
                                PubSub.publish(parsedData["room"], JSON.stringify({type: "roomDeleted"}));
                                PubSub.unsubscribe(parsedData["room"]);
                                db.query('select r.room_name as name, r.room_id as id, (Select count(m.msg_id) from Message m where m.room_id = id and (m.sent_at > (Select lastVisited from RoomUser ru where ru.user_id = ? and ru.room_id = id))) as newMsg from RoomUser ru2 Join Room r on r.room_id=ru2.room_id where ru2.user_id = ? and ru2.status=1 order by newMsg desc, ru2.lastVisited desc', [res.id, res.id], (err, db_res)=>{
                                    if(err) console.log(err);
                                    else{
                                        let temp = {rooms:[], type: "joinedRooms"};
                                        subscriptions = [];
                                        tokens = [];
                                        for(let i=0; i<db_res.length; i++) {
                                            subscriptions[i] = db_res[i]['id'];
                                            tokens.push(PubSub.subscribe(db_res[i]['id'], subscriber));
                                            tokens.push(PubSub.subscribe(db_res[i]['id']+":"+res.id, subscriber));
                                            temp["rooms"][i] = db_res[i];
                                        }
                                        ws.send(JSON.stringify(temp));
                                    }
                                });
                            }
                        })

                    })
                }
                case 'getInviteCode':{ // {room: roomid}
                    db.query("Select inviteCode from RoomUser where user_id = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0) ws.send(JSON.stringify({inviteCode: db_res[0]["inviteCode"], type: "inviteCode"}));
                    });
                    break;
                }
                case "alterUsers":{ // {room: roomid, users: [victim], action: true(kick)/false(ban)}
                    db.query("Select room_id from Room where owner = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0){
                            for(let user of parsedData["users"]){
                                db.query("Update RoomUser Set status = ? Where room_id = ? and user_id = ?", [parsedData["action"] ? "Out" : "Banned" ,parsedData["room"], user], (err)=>{
                                    if(err) console.log(err);
                                    PubSub.publish(parsedData["room"]+":"+user, JSON.stringify({type: "clearChat", room: parsedData["room"]}));
                                    if(user==parsedData["users"].at(-1)) PubSub.publish(parsedData["room"], JSON.stringify({action: parsedData["action"] ? "kicked" : "banned", type: "userAction", id: parsedData["room"]}));
                                });
                            }
                        }
                    })
                    break;
                }
                case "unbanUser":{// {room: roomid, user: id}
                    db.query("Select room_id from Room where owner = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0){
                            db.query("Update RoomUser Set status = 'Out' Where room_id = ? and user_id = ?", [parsedData["room"], parsedData["user"]], (err)=>{
                                if(err) console.log(err);
                                else PubSub.publish(parsedData["room"], JSON.stringify({action: "unbanned", type: "userAction", id: parsedData["room"]}));
                            });
                        }
                    })
                    break;
                }
                case "transOwner":{// {room: roomid, newOwner: userid}
                    db.query("Select room_id from Room where owner = ? and room_id = ?", [res.id, parsedData["room"]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length>0){
                            db.query("Select user_id from RoomUser where room_id = ? and user_id = ?", [parsedData["room"], parsedData["newOwner"]], (err, db_res)=>{
                                if(err) console.log(err);
                                else if(db_res.length>0){
                                    db.query("Update Room set owner=? where room_id = ?", [parsedData["newOwner"], parsedData["room"]], (err, db_res)=>{
                                        if(err) console.log(err);
                                        else PubSub.publish(parsedData["room"], JSON.stringify({action: "changedOwner", type: "userAction", id: parsedData["room"]})); 
                                    })
                                }
                            })
                        }
                    });
                    break;
                }
            }
        })
        
    })
});

app.post("/api/upload", (req, res)=>{
    jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, res_id)=>{
        if(err) switch(err['name']){
            case 'TokenExpiredError': res.status(401).send("Expired access token"); break;
            case 'JsonWebTokenError': res.status(401).send("Expired access token"); break;
            default: console.log(err); break;
        }else{
            let form = formidable({});
            let uploadsFolder = "./site/data/uploads/"
            form.parse(req, (err, fields, files)=>{
                if(err) console.log(err);
                else if(files['file'][0]['size']<10*1000*1000){
                    db.query("Select * from RoomUser where user_id = ? and room_id = ?", [res_id.id, fields['room'][0]], (err, db_res)=>{
                        if(err) console.log(err);
                        else if(db_res.length!=0){
                            if(!fs.existsSync(path.join(uploadsFolder, fields['room'][0]))) fs.mkdirSync(path.join(uploadsFolder, fields['room'][0]));
                            uploadsFolder = path.join(uploadsFolder, fields['room'][0]);
                            if(!fs.existsSync(path.join(uploadsFolder, res_id.id))) fs.mkdirSync(path.join(uploadsFolder, res_id.id));
                            uploadsFolder = path.join(uploadsFolder, res_id.id);
                            if(!fs.existsSync(path.join(uploadsFolder, files['file'][0]['originalFilename']))){
                                fs.renameSync(files['file'][0]['filepath'], path.join(uploadsFolder, files['file'][0]['originalFilename']));
                                res.status(200).json({link: "https://chat.mikmik.xyz/data/uploads/"+fields['room'][0]+"/"+res_id.id+"/"+files['file'][0]['originalFilename']})
                            }
                            else{
                                let fileName = files['file'][0]['originalFilename'].split(".")[0];
                                let extention = files['file'][0]['originalFilename'].split(".");
                                if(files['file'][0]['originalFilename'].split(".").length>1){
                                    extention.shift();
                                    extention = "."+extention.join(".")
                                }else extention = "";
                                let i = 1;
                                while(fs.existsSync(path.join(uploadsFolder, fileName+"_"+i+extention)))i++;
                                fs.renameSync(files['file'][0]['filepath'], path.join(uploadsFolder, fileName+"_"+i+extention));
                                res.status(200).json({link: "https://chat.mikmik.xyz/data/uploads/"+fields['room'][0]+"/"+res_id.id+"/"+fileName+"_"+i+extention})
                            }
                        }
                    })
                }
                else res.status(413).send();
            })
        }
    });
})

app.post("/api/linkType", (req, res)=>{
    jwt.verify(req.signedCookies['accessToken'], jwtAccSecret, (err, res_id)=>{
        if(err) switch(err['name']){
            case 'TokenExpiredError': res.status(401).send("Expired access token"); break;
            case 'JsonWebTokenError': res.status(401).send("Expired access token"); break;
            default: console.log(err); break;
        }else{
            fetch(req.body["url"], {method:'HEAD'}).then(
                res_url=>{
                    switch(res_url.headers.get("Content-type").split("/")[0]){
                        case "audio": res.json({parsed: "<br/><audio controls src="+req.body["url"]+" /><br/>"}); break;
                        case "video": res.json({parsed: "<br/><video style='max-width: 80%; max-height: 80%' controls loaded=\"scrollToBottom()\" ><source src="+req.body["url"]+"></video><br/>"}); break;
                        case "image": res.json({parsed: "<br/><img onload=\"scrollToBottom()\" style='max-width: 80%; max-height: 80%' src="+req.body["url"]+" /><br/>"}); break;
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
        if(err) switch(err['name']){
            case 'TokenExpiredError': res.status(401).send("Expired access token"); break;
            case 'JsonWebTokenError': res.status(401).send("Expired access token"); break;
            default: console.log(err); break;
        }else{
            db.query("Select password, color, username, pfp From User Where user_id=?", [result.id], (err, db_result)=>{
                if(err) console.log(err);
                else if(db_result.length != 0){
                    let temp = req.body;
                    temp["username"] = db_result[0]["username"];
                    bcrypt.compare(req.body["verifyPass"], db_result[0]['password']).then(crypt_res=>{if(crypt_res){
                        db.query("select user_id from User where username = ?", [req.body["username"]], (err, db_res)=>{
                            if(err) console.log(err);
                            else{
                                if(db_res.length==0 && db_result[0]["username"]!=req.body["username"] && req.body["username"]!="") temp["username"] = req.body["username"];
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
        }
    })
})

app.post("/api/auth/logout", (req, res)=>{
    jwt.verify(req.signedCookies['refreshToken'], jwtRefSecret, (err, result)=>{
        if(err) console.log(err);
        else {
            res.clearCookie("accessToken");
            res.clearCookie("refreshToken");
            res.status(200).send("Logout successful");
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
            res.cookie('accessToken', genAccessTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
            res.cookie('refreshToken', genRefreshTok, {signed: true, secure: true, overwrite: true, sameSite: "lax"});
            res.send("cookie");  
        }
    })
})

app.post("/api/auth/register", (req, res)=>{
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
    if(req.body.password != "" && req.body.username != ""){
        db.query("Select password, user_id From User Where username=?", [req.body.username], (err, db_result)=>{
            if(err) console.log(err);
            else if(db_result.length != 0){
                bcrypt.compare(req.body.password, db_result[0]['password']).then(crypt_res=>{
                    if(crypt_res){
                        let genAccessTok = jwt.sign({id: db_result[0]['user_id']}, jwtAccSecret, {expiresIn: '10m'});
                        let genRefreshTok = jwt.sign({id: db_result[0]['user_id']}, jwtRefSecret, {expiresIn: '7d'});
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
	console.log("Chat up - "+new Date(Date.now()+3600000).toLocaleString("sl-SI"));
    
});

io.init({
    transactions: true // will enable the transaction tracing
})