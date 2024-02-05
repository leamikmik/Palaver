const domain="https://chat.mikmik.xyz/api"

let socket;// = new WebSocket("wss://chat.mikmik.xyz/ws/");

let current_room = "";
let current_room_users = [];
let joined_rooms = {"":0};

function enterCP(event){
    if(event.key=="Enter") changePassword();
}
function enterCU(event){
    if(event.key=="Enter") changeUsername();
}
function enterMsg(event){
    if(event.key == "Enter") sendMsg();
}

function changePassword(){
    const passwordCP = document.getElementById("passwordCP");
    const passwordCPN = document.getElementById("passwordCPN");
    const passwordCPN2 = document.getElementById("passwordCPN2");
    if(passwordCP.value!=""&&passwordCPN.value!=""&&passwordCPN.value==passwordCPN2.value) 
        socket.send(JSON.stringify({pass: passwordCP.value, newPass: passwordCPN.value, type: "changeSetting", setting: "password"}));
}

function changeUsername(){
    const password = document.getElementById("passwordCU");
    const username = document.getElementById("usernameCU");
    if(password.value!=""&&username.value!="") socket.send(JSON.stringify({newUser: username.value, pass: password.value, type: "changeSetting", setting: "username"}))
}

function changeColor(){
    const color2 = document.getElementById("color");
    if(curColor!=color2.value) socket.send(JSON.stringify({newColor: color2.value,type:"changeSetting", setting:"color"}));
}

let curSelected=-1;
let curElement;
const posOptions = ["changePassword", "changeUsername", "changePfp", "changeColor"];

function selectSetting(selected){
    if(curSelected!=-1) curElement.style.display = "none";
    curElement = document.getElementById(posOptions[selected]);
    curElement.style.display = "";
    curSelected = selected;
}

function format () {
  return Array.prototype.slice.call(arguments).join(' ')
}

function sendMsg(){
    const text_field = document.getElementById("chatMsg");
    if(text_field.value!="" && text_field.value.length < 2001 && current_room!="") {
        socket.send(JSON.stringify({msg: text_field.value, room: current_room, type:"sendMsg"}))
        text_field.value="";
    }
}

function toSettings(){
    document.getElementById("chat").style.display="none";
    document.getElementById("settings").style.display="";
}

function toChat(){
    document.getElementById("settings").style.display="none";
    document.getElementById("chat").style.display="";
}

function tryColor(){
    const color = document.getElementById("color");
    const colorDemo = document.getElementById("colorDemo");
    colorDemo.style.color = color.value;
}

function changeRoom(){
    const joinedRooms = document.getElementById("rooms");
    //console.log(joinedRooms.value);
    if(current_room!=joinedRooms.value){
        socket.send(JSON.stringify({id: joinedRooms.value, type:"getRoom"}))
        current_room=joinedRooms.value;
    }
}

function create(){
    let name = prompt("Name the new room");
    if(!(name==""||name==null)){
        socket.send(JSON.stringify({roomName: name, type: "createRoom"}));
    }
}

function join(){
    let code = prompt("Type invite code");
    console.log(code);
    if(!(code==""||code==null)){
        socket.send(JSON.stringify({inviteCode: code, type: "joinRoom"}));
    }
}

function logout(){
    fetch(domain+"/auth/logout", {
        method: "POST",
        headers: {
            "Content-type": "application/json; charset=UTF-8",
        },
        credentials: 'include'
    }).then((res)=>{
        console.log(res);
        if(res.status==200) window.location.href = "https://www.mikmik.xyz/chat/login";
    });
}

function deleteRoom(){
    let name = prompt("THIS WILL PERMANENTLY DELETE THE ROOM!!! Type room name to confirm")
    if(!(name==""||name==null))
        socket.send(JSON.stringify({roomName: name, room: current_room, type: "deleteRoom"}))
}

function invite(){
    socket.send(JSON.stringify({room: current_room,type: "getInviteCode"}))
}

let old = 0;

function scroll(){
    const chatbox = document.getElementById("chatbox");
    if(chatbox.scrollTop==0){
        socket.send(JSON.stringify({times: old, room: current_room, type: "getMoreRoom"})).then(()=>{
            old++;
        });
    }
}

let curColor;

function connectSocket(){
    
    socket = new WebSocket("wss://chat.mikmik.xyz/api/ws/");
    socket.onopen = (event)=>{
        console.log(event);
    }
    socket.onmessage = (event)=>{
        //console.log(event);
        if(event.data=="PING") socket.send("PONG");
        let parsedData = JSON.parse(event.data) || null;
        const chatbox = document.getElementById("chatbox");
        const activeUsers = document.getElementById("aU_text");
        const joinedRooms = document.getElementById("rooms");
        const alertPop = document.getElementById("alert");
        const alertMsg = document.getElementById("alertMsg");
        switch(parsedData["type"]){
            case "userName": 
                //document.getElementById("userName").innerHtml = "You are: <a style='text-color: "+parsedData["color"]+"; '>" + parsedData["username"]+"</a>"; 
                const color = document.getElementById("color");
                const colorDemo = document.getElementById("colorDemo");
                color.value = parsedData["color"];
                colorDemo.innerText = parsedData["username"];
                colorDemo.style.color = parsedData["color"];
                curColor=parsedData["color"];
                document.getElementById("userName").innerText = parsedData["username"]; 
                document.getElementById("userName").style.color = parsedData["color"];
                break;
            case "joinedRooms":
                while(joinedRooms.firstChild) joinedRooms.removeChild(joinedRooms.lastChild);
                while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);

                let option = document.createElement("option");
                option.innerHTML = "selected"
                option.value = ""
                option.innerText = "---"
                joinedRooms.appendChild(option);
                current_room = "";

                parsedData["rooms"].forEach(room => {
                    let option = document.createElement("option");
                    option.value = room['id'];
                    option.innerText = room["newMsg"]==0 ? room['name']: room['name']+" ("+room["newMsg"]+")";
                    joinedRooms.appendChild(option);
                    joined_rooms[room['id']] = room["newMsg"];
                });
                break;
            case "getRoom":
                while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);
                //console.log(parsedData["owner"]);
                document.getElementById("deleteRoom").style.display = parsedData["owner"]==true ? "" : "none";
                parsedData["messages"].reverse().forEach((msg)=>{
                    let p = document.createElement("p");
                    let i = document.createElement("i");
                    let b = document.createElement("b");
                    let text = document.createElement("text");
                    p.classList.add("msg")
                    b.style.color = msg["color"];
                    if(msg["newUser"]){
                        b.innerText = msg["sender"];
                        text.innerText = " has joined the room.";
                    }else{
                        b.innerText = msg["sender"]+": ";
                        text.innerText = " "+msg['msg'];
                    }
                    i.style.marginLeft = "auto";
                    i.innerText = new Date(msg["sent_at"]).toLocaleString("sl-SI");
                    p.appendChild(b);
                    p.appendChild(text);
                    p.appendChild(i);
                    chatbox.appendChild(p);
                });
                activeUsers.innerText="";
                current_room_users = [];
                parsedData["active"].forEach((user)=>{
                    if(current_room_users.length==0) activeUsers.innerText = user["username"];
                    else activeUsers.innerText = activeUsers.innerText + ", " + user["username"];
                    current_room_users.push(user["username"]);
                })
                //chatbox.scrollTop = chatbox.offsetHeight;
                //console.log(chatbox.scrollHeight)
                chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight
                if(joined_rooms[parsedData["room"]]!=0) 
                    for(i = 0; i<joinedRooms.children.length; i++) 
                        if(joinedRooms.children[i].value==parsedData['room'])
                            joinedRooms.children[i].innerText = joinedRooms.children[i].innerText.slice(0, -4);
                break;
            case "newMsg":
                if(current_room==parsedData['room']){
                    const isScrolledToBottom = chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 1
                    let p = document.createElement("p");
                    let i = document.createElement("i");
                    let b = document.createElement("b");
                    let text = document.createElement("text");
                    p.classList.add("msg")
                    b.style.color = parsedData["color"];
                    b.innerText = parsedData["newUser"] ? parsedData["sender"] : parsedData["sender"]+": ";
                    text.innerText = parsedData["newUser"] ? " has joined the room." : " "+parsedData['msg'];
                    i.style.marginLeft = "auto";
                    i.innerText = new Date(parsedData["sent_at"]).toLocaleString("sl-SI");
                    p.appendChild(b);
                    p.appendChild(text);
                    p.appendChild(i);
                    chatbox.appendChild(p);
                    if (isScrolledToBottom){
                      chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight
                    }
                    socket.send(JSON.stringify({room: parsedData['room'], type: "recieved"}));
                }else for(i = 0; i<joinedRooms.children.length; i++) if(joinedRooms.children[i].value==parsedData['room']){

                    joined_rooms[parsedData['room']]++;
                    if(joined_rooms[parsedData['room']]==1) joinedRooms.children[i].innerText = joinedRooms.children[i].innerText + " (" + joined_rooms[parsedData['room']] + ")";
                    else joinedRooms.children[i].innerText = joinedRooms.children[i].innerText.slice(0, -(2+joined_rooms[parsedData['room']].toString().length)) + "("+ joined_rooms[parsedData['room']] + ")";
                }
                //chatbox.scrollTop = chatbox.offsetHeight;
                break;
            case "inviteCode":
                alert("Send this code to your friends: " + parsedData["inviteCode"])
                break;
            case "userAction":
                switch(parsedData["action"]){
                    case "joined":
                        if(!current_room_users.includes(parsedData["name"]) && current_room==parsedData["room"]){
                            current_room_users.push(parsedData["name"]);
                            activeUsers.innerText = "";
                            current_room_users.forEach((user)=>{
                                if(activeUsers.innerText == "") activeUsers.innerText = user;
                                else activeUsers.innerText = activeUsers.innerText + ", " + user;
                            })
                        }
                        break;
                    case "left":
                        //console.log(current_room_users);
                        const index = current_room_users.indexOf(parsedData["name"]);
                        if (index > -1 && current_room==parsedData["room"]) {
                          current_room_users.splice(index, 1);
                          activeUsers.innerText = "";
                          current_room_users.forEach((user)=>{
                            if(activeUsers.innerText == "") activeUsers.innerText = user;
                            else activeUsers.innerText = activeUsers.innerText + ", " + user;
                          })
                        }
                        break;
                }
                break;
            default: console.log(parsedData);
        }
        switch(parsedData['statusCode']){
            case 401: 
                    fetch(domain+'/auth/refreshToken',{method: "POST", credentials: 'include'}).then((res)=>{
                        if(res.status==401) window.location.href = "https://chat.mikmik.xyz/login";
                        socket.close();
                        connectSocket();
                });
                break;
            case 200:
                if(parsedData["alert"]){
                    alertPop.style.color = "green";
                    alertMsg.value = parsedData["msg"];
                    alertPop.style.display = "";
                }
            //default: console.log(parsedData['statusCode']);
        }
    }
}

document.addEventListener("DOMContentLoaded", ()=>{
    connectSocket();
})
