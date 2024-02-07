const domain="https://chat.mikmik.xyz/api";
let socket;
let current_room = "";
let changedSettings = false;
let pfpLock = false;
let settings_proc = false;
let page = 0;
let loadingMsgs = false;
let noMoreMsgs = false;
let cropper = '';
let conSettingsModal;
  
function onlyUnique(value, index, array) {
    return array.indexOf(value) === index;
}

function scrollBottomImg(el){
    const chatbox = document.getElementById("chatbox");
    const isScrolledToBottom = chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 1;
    if (isScrolledToBottom){
        chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight;
    }
}

function urlify(text, el){
    let temp = text.match(/\b((?:[a-z][\w-]+:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.-]+[.][a-z]{2,4}\/)(?:(?:[^\s()<>.]+[.]?)+|((?:[^\s()<>]+|(?:([^\s()<>]+)))))+(?:((?:[^\s()<>]+|(?:([^\s()<>]+))))|[^\s`!()[]{};:'".,<>?«»“”‘’]))/gi)
    if(temp) for(let url of temp.filter(onlyUnique))
        fetch(domain+"/linkType", {
            method: "POST",
            body: JSON.stringify({url: url}),
            headers: {
                "Content-type": "application/json; charset=UTF-8",
            },
            credentials: 'include'
        }).then(res=>res.json()).then(
            data=>{
                el.innerHTML = text.replaceAll(url, data["parsed"]);
            }
        );
}

function enterMsg(event){
    if(event.key == "Enter") sendMsg();
}
function enterCreate(event){
    if(event.key == "Enter") create();
}
function enterJoin(event){
    if(event.key == "Enter") join();
}
function enterSettings(event){
    if(event.key == "Enter"&&!settings_proc) saveSettings();
}

function toggleVisibility(btn){
    btn.children[0].style.display = btn.children[0].style.display == "none" ? "" : "none"; 
    btn.children[1].style.display = btn.children[1].style.display == "none" ? "" : "none"; 
    btn.parentElement.children[0].type = btn.parentElement.children[0].type == "password" ? "text" : "password"; 
}

//Settings functions

function gotoRoomSettings(){
    document.getElementById("roomSettings").style.display="";
}

function closeRoomSettings(){
    document.getElementById("roomSettings").style.display = "none";
}

function gotoSettings(){
    document.getElementById("settings").style.display="";
}

function closeSettings(){
    if(changedSettings){
        const modal = new bootstrap.Modal('#closeSettingsModal', {});
        modal.show()
    }
    else{
        document.getElementById("settings").style.display="none";
    }
    
}

function confirmCloseSettings(){
    settings_proc=false;
    changedSettings = false;
    document.getElementById("changedSettings").style.display = "none";
    pfpLock = false;
    socket.close();
    closeSettings();
}

function tryColor(){
    changeSettings();
    document.getElementById("settingsUserName").style.color = document.getElementById("S_color").value;
    document.getElementById("S_colorHex").innerText = document.getElementById("S_color").value;
}

function tryUsername(){
    changeSettings();
    document.getElementById("settingsUserName").innerText = document.getElementById("S_userName").value; 
}

function changeSettings(){
    if(!changedSettings) document.getElementById("changedSettings").style.display = "";
    changedSettings = true;
}

function saveSettings(){
    if(changedSettings){
        settings_proc=true;
        document.getElementById("saveSetBtn").disabled = true;
        let temp = {
            username: document.getElementById("S_userName").value,
            color: document.getElementById("S_color").value,
            pfp: pfpLock ? document.getElementById("S_pfp").src : "",
            verifyPass: document.getElementById("saveSetPass").value,
            type: "changeSettings"
        };
        fetch(domain+"/setSettings", {
            method: "POST",
            body: JSON.stringify(temp),
            headers: {
                "Content-type": "application/json; charset=UTF-8",
            },
            credentials: 'include'
        }).then((res)=>{
            switch(res.status){
                case 200:
                    changedSettings = false;
                    document.getElementById("changedSettings").style.display = "none";
                    pfpLock = false;
                    document.getElementById("saveSetPass").value = "";
                    const modal = new bootstrap.Modal('#confirmSettingsModal', {});
                    modal.hide()
                    break;
                case 401: generateToast("Incorrect password", "bg-danger", "Warning"); break;
                default: console.log(res);
            }
            settings_proc=false;
            document.getElementById("saveSetBtn").disabled = false;
        });
    }
}

function savePfp(){
    pfpLock = true;
    changeSettings();
    let imgSrc = cropper.getCroppedCanvas({
        width: 300,
        heigh: 300
    }).toDataURL();
    document.getElementById("S_pfp").src = imgSrc;   
}

function deletePfp(){
    pfpLock = true;
    changeSettings();
    document.getElementById("S_pfp").src = "./images/default_user.jpg";
}

function deleteRoom(){

}

function toggleInput(id){
    document.getElementById(id).disabled = !document.getElementById(id).disabled;
    if(!document.getElementById(id).disabled) document.getElementById(id).focus();
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
        if(res.status==200) window.location.href = "https://chat.mikmik.xyz/login";
    });
}

function create(){
    let name = document.getElementById("createRoomName").value;
    if(!(name==""||name==null)){
        socket.send(JSON.stringify({roomName: name, type: "createRoom"}));
    }
}

function join(){
    let code = document.getElementById("joinRoomName").value;
    if(!(code==""||code==null)){
        socket.send(JSON.stringify({inviteCode: code, type: "joinRoom"}));
    }
}

function copyInvite(){
    let inviteCode = document.getElementById("inviteCode");
    inviteCode.select();
    inviteCode.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(inviteCode.value).then(
        ()=>{generateToast("Invite code copied!", "bg-success")},
        ()=>{generateToast("Invite code failed to copy!", "bg-danger")}
    );
}

function generateToast(content, color, header=""){
    let toast = document.getElementById("tempToast").content.cloneNode(true).children[0];
    toast.classList.add(color);
    toast.children[1].innerText = content;
    toast.children[0].children[0].src = "./images/palaver.png";
    toast.children[0].children[1].innerText = header;
    toast.addEventListener("hidden.bs.toast", ()=>{
        toast.remove();
    })
    document.getElementById("toast-container").appendChild(toast);
    const toastF = bootstrap.Toast.getOrCreateInstance(toast);
    toastF.show();
}

function newMessageToast(msg){
    let toast = document.getElementById("tempToast").content.cloneNode(true).children[0];
    if(msg["pfp"]!=null) toast.children[0].children[0].src = msg["pfp"];
    toast.children[0].children[1].style.color = msg["color"];
    toast.children[0].children[1].innerText = msg["sender"];
    toast.children[0].children[2].innerText = msg["roomName"];
    toast.children[1].innerText = msg["newUser"] ? "has joined the room." : msg['msg'];
    toast.addEventListener("hidden.bs.toast", ()=>{
        toast.remove();
    })
    document.getElementById("toast-container").appendChild(toast);
    const toastF = bootstrap.Toast.getOrCreateInstance(toast);
    toastF.show();
}

function generateRoomButton(room){
    let button = document.getElementById("tempRoom").content.cloneNode(true).children[0];
    button.children[0].innerText = room['newMsg']<100 ? room['newMsg'] : "+99";
    if(room["newMsg"]==0) button.children[0].style.display = "none";
    button.children[1].innerText = room['name'];
    
    button.addEventListener("click", ()=>{
        socket.send(JSON.stringify({id: room["id"], type:"getRoom"}))
        if(changedSettings) closeSettings();
        closeRoomSettings();
        focusSend();
    })
    
    button.id = room["id"];
    return button;
}

function generateMsg(msg){
    let div = document.getElementById("tempMsg").content.cloneNode(true).children[0];
    if(msg["pfp"]!=null) div.children[0].src = msg["pfp"];
    div.children[1].style.color = msg["color"];
    div.children[1].innerText = msg["newUser"] ? msg["sender"] : msg["sender"]+": ";
    div.children[2].innerHTML = msg["newUser"] ? " has joined the room." : msg['msg'];
    div.children[3].innerText = new Date(msg["sent_at"]).toLocaleString("sl-SI");
    urlify(div.children[2].innerHTML, div.children[2])
    return div;
}

function generateMember(user){
    let div = document.getElementById("tempMember").content.cloneNode(true).children[0];
    if(user["pfp"]!=null) div.children[0].src = user["pfp"];
    div.children[1].style.color = user["color"];
    div.children[1].innerText = user["username"];
    if(!user["active"]) div.children[2].style.display = "";
    return div;
}

function generateSettingsMember(user){
    let div = document.getElementById("tempSettingsMember").content.cloneNode(true).children[0];
    if(user["pfp"]!=null) div.children[0].src = user["pfp"];
    div.children[1].style.color = user["color"];
    div.children[1].innerText = user["username"];
    return div;
}

function scrollToTop(){
    const chatbox = document.getElementById("chatbox");
    if(chatbox.scrollTop<50 && !loadingMsgs && !noMoreMsgs){
        page++;
        loadingMsgs = true;
        socket.send(JSON.stringify({type: "getMoreRoom", times: page, id: current_room}));
    }else if(loadingMsgs) chatbox.scrollTop = 60;
    if(!(chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 1)){
        document.getElementById("scrollToBottom").style.display = "";
    }else document.getElementById("scrollToBottom").style.display = "none";
}

function scrollToBottom(){
    const chatbox = document.getElementById("chatbox");
    chatbox.style.scrollBehavior = "smooth";
    chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight
    document.getElementById("scrollToBottom").style.display = "none";
    chatbox.style.scrollBehavior = "auto";
}

function focusSend(){
    document.getElementById("chatMsg").focus();
}

function sendMsg(){
    const text_field = document.getElementById("chatMsg");
    if(text_field.value.trim()!="" && text_field.value.length < 2001 && current_room!="") {
        socket.send(JSON.stringify({msg: text_field.value.trim(), room: current_room, type:"sendMsg"}))
        text_field.value="";
    }
}

function connectSocket(){
    const joinedRooms = document.getElementById("joinedRooms");
    const joinedUsers = document.getElementById("joinedUsers")
    const RS_joinedUsers = document.getElementById("RS_joinedUsers");
    const chatbox = document.getElementById("chatbox");
    const inviteCode = document.getElementById("inviteCode");
    socket = new WebSocket("wss://chat.mikmik.xyz/api/ws/");
    socket.onopen = (event)=>{
        console.log(event);
    }
    socket.onclose = (event)=>{
        console.log(event);
        connectSocket();
    }
    socket.onmessage = (event)=>{
        //console.log(event);
        let parsedData = JSON.parse(event.data) || null;
        if(parsedData["ping"]=="PING") socket.send(JSON.stringify({ping: "PONG"}));
        else switch(parsedData["type"]){
            case "userName": 
                document.getElementById("S_userName").value = parsedData["username"];
                document.getElementById("S_color").value = parsedData["color"];
                document.getElementById("S_colorHex").innerText = parsedData["color"];
                //document.getElementById("S_email").value = parsedData["email"];
                document.getElementById("settingsUserName").innerText = parsedData["username"]; 
                document.getElementById("settingsUserName").style.color = parsedData["color"];

                document.getElementById("userName").innerText = parsedData["username"];
                document.getElementById("userName").style.color = parsedData["color"];
                if(parsedData["pfp"]!=null){
                    document.getElementById("pfp").src = parsedData["pfp"];
                    document.getElementById("S_pfp").src = !pfpLock ? parsedData["pfp"] : document.getElementById("S_pfp").src;
                }
                break;
            case "joinedRooms":
                while(joinedRooms.firstChild) joinedRooms.removeChild(joinedRooms.lastChild);
                //while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);
                parsedData["rooms"].forEach(room => {
                    joinedRooms.appendChild(generateRoomButton(room));
                });
                break;
            case "freshUsers":
                while(joinedUsers.firstChild) joinedUsers.removeChild(joinedUsers.lastChild);
                parsedData["members"].forEach((user)=>{
                    joinedUsers.appendChild(generateMember(user));
                });
                break;
            case "getRoom":
                while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);
                while(joinedUsers.firstChild) joinedUsers.removeChild(joinedUsers.lastChild);
                while(RS_joinedUsers.firstChild) RS_joinedUsers.removeChild(RS_joinedUsers.lastChild);
                document.getElementById("roomSettingsBtn").style.display = parsedData["owner"] ? "" : "none";
                document.getElementById("roomName").innerText=parsedData["roomName"];
                document.getElementById(parsedData["room"]).children[0].style.display="none";
                document.getElementById(parsedData["room"]).children[0].innerText = 0;
                inviteCode.value = parsedData["inviteCode"];
                current_room = parsedData["room"];
                page = 0;
                loadingMsgs = false;
                noMoreMsgs = false;
                parsedData["messages"].forEach((msg)=>{
                    chatbox.prepend(generateMsg(msg));
                });
                parsedData["members"].forEach((user)=>{
                    joinedUsers.append(generateMember(user));
                });

                if(parsedData["owner"]){
                    parsedData["members"].forEach((user)=>{
                        RS_joinedUsers.append(generateSettingsMember(user));
                    });
                    document.getElementById("roomSetName").value = parsedData["roomName"];
                }

                chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight;
                break;
            case "getMoreRoom":
                loadingMsgs = false;
                let temp = chatbox.scrollHeight;
                if(parsedData["messages"].length<50) noMoreMsgs = true;
                parsedData["messages"].forEach((msg)=>{
                    chatbox.prepend(generateMsg(msg));
                });
                chatbox.scrollHeight = temp;
                break;
            case "newMsg":
                if(current_room==parsedData['room']){
                    const isScrolledToBottom = chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 1;

                    chatbox.append(generateMsg(parsedData));

                    if (isScrolledToBottom){
                      chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight;
                    }
                    socket.send(JSON.stringify({room: parsedData['room'], type: "recieved"}));
                }else {
                    document.getElementById(parsedData["room"]).children[0].style.display="";
                    document.getElementById(parsedData["room"]).children[0].innerText = Number(document.getElementById(parsedData["room"]).children[0].innerText)+1;
                    newMessageToast(parsedData);
                }
                break;
            case "userAction":
                if(current_room == parsedData["id"])
                socket.send(JSON.stringify({id: parsedData["id"], type: "refreshUsers"}))
                break;
            default: console.log(parsedData);
        }
        switch(parsedData['statusCode']){
            case 401: 
                    fetch(domain+'/auth/refreshToken',{method: "POST", credentials: 'include'}).then((res)=>{
                        if(res.status==401) window.location.href = "https://chat.mikmik.xyz/login";
                        socket.close();
                        //connectSocket();
                });
                break;
        }
    }
}

document.addEventListener("DOMContentLoaded", ()=>{
    connectSocket();
    conSettingsModal = new bootstrap.Modal('#editPfp', {});
})

document.getElementById("pfp_upload").addEventListener('change', e=>{
    if(e.target.files.length){
        const modal = new bootstrap.Modal('#editPfp', {});
        modal.show()
        //document.getElementById("editPfp")
        const reader = new FileReader();
        reader.onload = e => {
          if (e.target.result) {
            // create new image
            let img = document.createElement('img');
            img.id = 'pfp_crop_img';
            img.src = e.target.result;
            //img.style.height = "500px";
            document.getElementById("pfp_crop").innerHTML = '';
            document.getElementById("pfp_crop").appendChild(img);
            cropper = new Cropper(img, {
                viewMode: 3,
                aspectRatio: 1,
                cropBoxResizable: false,
                cropBoxMovable: false,
                dragMode: 'move',
                minCanvasHeight: 400,
                minCanvasWidth: 400,
                minContainerHeight: 400,
                minContainerWidth: 400
            });
          }
        };
        reader.readAsDataURL(e.target.files[0]);
    }
})