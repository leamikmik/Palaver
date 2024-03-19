const domain="https://chat.mikmik.xyz/api";
let socket;
let current_room = "";
let current_room_name = "";
let changedSettings = false;
let pfpLock = false;
let settings_proc = false;
let page = 0;
let loadingMsgs = false;
let noMoreMsgs = false;
let cropper = '';
let loadedMsgs = 0;
let modals = {};
  
function temp(){
    generateToast("Sorry! Feature not yet implemented.", "bg-danger", "Warning")
}

function openModal(id){
    modals[id].show()
}

function closeModal(id){
    modals[id].hide();
}

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
                loadedMsgs++;
            }
        );
    else loadedMsgs++;
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
    document.getElementById("chatMsg").disabled = true;
    
}

function closeRoomSettings(){
    document.getElementById("roomSettings").style.display = "none";
    document.getElementById("chatMsg").disabled = false;
}

function gotoSettings(){
    document.getElementById("settings").style.display="";
    document.getElementById("chatMsg").disabled = true;
}

function closeSettings(){
    if(changedSettings){
        modals["closeSettings"].show()
    }
    else{
        document.getElementById("settings").style.display="none";
        document.getElementById("chatMsg").disabled = false;
    }
    
}

function confirmCloseSettings(){
    settings_proc=false;
    changedSettings = false;
    document.getElementById("changedSettings").style.display = "none";
    document.getElementById("chatMsg").disabled = false;
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

function editRoomName(el){
    current_room_name = document.getElementById("roomSetName").value;
    document.getElementById("roomSetName").disabled = false;
    el = el.parentElement;
    el.children[0].style.display = "none";
    el.children[1].style.display = "";
    el.children[2].style.display = "none";
    el.children[3].style.display = "";
}

function saveRoomName(el){
    newName = document.getElementById("roomSetName").value;
    if(newName.trim() !="" && newName.length < 32 && newName!=current_room_name){
        socket.send(JSON.stringify({type: "renameRoom", newName: newName, room: current_room}));
        el = el.parentElement;
        el.children[0].style.display = "";
        el.children[1].style.display = "none";
        el.children[2].style.display = "";
        el.children[3].style.display = "none";
        document.getElementById("roomSetName").disabled = true;
    }
        
}

function cancelRoomName(el){
    document.getElementById("roomSetName").value = current_room_name;
    el = el.parentElement;
    el.children[0].style.display = "";
    el.children[1].style.display = "none";
    el.children[2].style.display = "";
    el.children[3].style.display = "none";
}

function saveSettings(){
    if(changedSettings && document.getElementById("S_userName").value!=""){
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
                    closeModal("confirmCloseSettings");
                    break;
                case 401: generateToast("Incorrect password", "bg-danger", "Warning"); break;
                default: console.log(res);
            }
            settings_proc=false;
            document.getElementById("saveSetBtn").disabled = false;
            document.getElementById("saveSetPass").value = "";
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
    closeModal('editPfp');
}

function deletePfp(){
    pfpLock = true;
    changeSettings();
    document.getElementById("S_pfp").src = "./images/default_user.jpg";
}

function deleteRoom(){
    socket.send(JSON.stringify({type: "deleteRoom", room: current_room}));
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
        socket.send(JSON.stringify({roomName: name, type: "createRoom", secure: document.getElementById("createRoomSecure").checked, expires: document.getElementById("createRoomExpires").checked ? document.getElementById("createRoomExpireDate").value : null}));
    }
}

function openCreate(){
    document.getElementById("createRoomName").value = "";
    document.getElementById("createRoomExpires").checked = false;
    document.getElementById("createRoomExpireDate").valueAsDate = new Date();
    document.getElementById("createRoomExpireDate").style.display = "none";
    modals["createRoom"].show();
}

function toggleDatePicker(check){
    let datePicker = document.getElementById("createRoomExpireDate");
    datePicker.style.display = check.checked ? "" : "none";
    datePicker.valueAsDate = new Date();
    datePicker.min = datePicker.value;
}

function join(){
    let code = document.getElementById("joinRoomName").value;
    if(!(code==""||code==null)){
        socket.send(JSON.stringify({inviteCode: code, type: "joinRoom"}));
    }
}

function leaveRoom(){
    socket.send(JSON.stringify({type: "leaveRoom", room: current_room}))
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
        for(let room of document.getElementById("joinedRooms").children){
            room.classList.remove("active")
        }
        button.classList.add("active")
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
    div.id = msg["id"];
    if(msg["pfp"]!=null) div.children[0].src = msg["pfp"];
    div.children[1].style.color = msg["color"];
    div.children[1].innerText = msg["newUser"] ? msg["sender"] : msg["sender"]+": ";
    div.children[2].children[0].innerHTML = msg["newUser"] ? " has joined the room." : msg['msg'];
    div.children[3].children[0].children[2].innerText = new Date(msg["sent_at"]).toLocaleString("sl-SI");
    div.children[3].children[0].children[0].style.display = msg["msgOwner"]=="true" ? "" : "none";
    div.children[3].children[0].children[1].children[1].addEventListener("click", ()=>{
        socket.send(JSON.stringify({type: "deleteMsg", id: msg["id"]}));
    })
    urlify(div.children[2].innerHTML, div.children[2].children[0])
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
    if(user["pfp"]!=null) div.children[1].src = user["pfp"];
    div.children[2].style.color = user["color"];
    div.children[2].innerText = user["username"];
    div.children[4].children[0].addEventListener("click", ()=>{
        socket.send(JSON.stringify({room: current_room, users: [user["id"]], type: "alterUsers", action: true}))
    });
    div.children[4].children[1].addEventListener("click", ()=>{
        socket.send(JSON.stringify({room: current_room, users: [user["id"]], type: "alterUsers", action: false}))
    });
    div.children[4].children[2].addEventListener("click", ()=>{
        document.getElementById("TO_pfp").src = user["pfp"];
        document.getElementById("TO_userName").innerText = user["username"];
        document.getElementById("TO_userName").style.color = user["color"];
        document.getElementById("TO_id").value = user["id"];
        openModal('transOwner');
    });
    div.children[5].value = user["id"];
    return div;
}

function generateBannedSettingsMember(user){
    let div = document.getElementById("tempSettingsBannedMember").content.cloneNode(true).children[0];
    if(user["pfp"]!=null) div.children[0].src = user["pfp"];
    div.children[1].style.color = user["color"];
    div.children[1].innerText = user["username"];
    div.children[2].addEventListener("click", ()=>{
        socket.send(JSON.stringify({room: current_room, user: user["id"], type: "unbanUser"}));
    });
    return div
}

function transOwner(){
    socket.send(JSON.stringify({type: "transOwner", room: current_room, newOwner: document.getElementById("TO_id").value}))
    closeModal("transOwner");
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
    if(!document.getElementById("chatMsg").disabled) document.getElementById("chatMsg").focus();
}

function sendMsg(){
    const text_field = document.getElementById("chatMsg");
    if(text_field.value.trim()!="" && text_field.value.length < 10000 && current_room!="") {
        socket.send(JSON.stringify({msg: text_field.value.trim(), room: current_room, type:"sendMsg"}))
        text_field.value="";
    }
}

function alterSelected(which){
    let users = document.getElementById("RS_joinedUsers");
    let temp = {users: [], type: "alterUsers", action: which ? true : false , room: current_room};
    for(let user of users.children){
        if(user.children[0].checked) temp["users"].push(user.children[5].value);
    }
    if(temp["users"].length>0) socket.send(JSON.stringify(temp));
}

function connectSocket(){
    const joinedRooms = document.getElementById("joinedRooms");
    const joinedUsers = document.getElementById("joinedUsers")
    const RS_joinedUsers = document.getElementById("RS_joinedUsers");
    const RS_bannedUsers = document.getElementById("RS_bannedUsers");
    const chatbox = document.getElementById("chatbox");
    const inviteCode = document.getElementById("inviteCode");
    const loadingChat = document.getElementById("loadingChat");
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
                document.getElementById("userName").parentElement.style.color = parsedData["color"];
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
                if(parsedData["newRoom"]){
                    modals["createRoom"].hide();
                    modals["joinRoom"].hide();
                }
                if(current_room!="") document.getElementById(current_room).classList.add("active");
                break;
            case "freshData":
                if(current_room == parsedData["id"]){
                    while(joinedUsers.firstChild) joinedUsers.removeChild(joinedUsers.lastChild);
                    while(RS_joinedUsers.firstChild) RS_joinedUsers.removeChild(RS_joinedUsers.lastChild);
                    while(RS_bannedUsers.firstChild) RS_bannedUsers.removeChild(RS_bannedUsers.lastChild);
                    while(joinedRooms.firstChild) joinedRooms.removeChild(joinedRooms.lastChild);
                    parsedData["members"].forEach((user)=>{
                        if(!user["banned"])joinedUsers.appendChild(generateMember(user));
                    });
                    parsedData["rooms"].forEach(room => {
                        joinedRooms.appendChild(generateRoomButton(room));
                        if(room["id"]==current_room) document.getElementById("roomName").innerText= room["name"];
                    });
                    if(current_room!="") document.getElementById(current_room).classList.add("active");
                    document.getElementById("roomSettingsBtn").style.display = parsedData["owner"] ? "" : "none";
                    document.getElementById("leaveBtn").style.display = parsedData["owner"] ? "none" : "";
                    if(parsedData["owner"]){
                        parsedData["members"].forEach((user)=>{
                            if(!user["owner"] && !user["banned"]) RS_joinedUsers.append(generateSettingsMember(user));
                            else if(user["banned"]) RS_bannedUsers.append(generateBannedSettingsMember(user));
                        });
                    } else if(document.getElementById("roomSettings").style.display == ""){
                        document.getElementById("roomSettings").style.display = "none";
                    }
                }
                break;
            case "getRoom":
                loadingChat.style.display = "flex"
                while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);
                while(joinedUsers.firstChild) joinedUsers.removeChild(joinedUsers.lastChild);
                while(RS_joinedUsers.firstChild) RS_joinedUsers.removeChild(RS_joinedUsers.lastChild);
                while(RS_bannedUsers.firstChild) RS_bannedUsers.removeChild(RS_bannedUsers.lastChild);
                document.getElementById("roomSettingsBtn").style.display = parsedData["owner"] ? "" : "none";
                document.getElementById("leaveBtn").style.display = parsedData["owner"] ? "none" : "";
                document.getElementById("roomName").innerText=parsedData["roomName"];
                document.getElementById(parsedData["room"]).children[0].style.display="none";
                document.getElementById(parsedData["room"]).children[0].innerText = 0;
                document.getElementById("chatMsg").disabled = true;
                document.getElementById("chatMsg").value = "";
                document.getElementById("msgInput").style.display = "none";
                inviteCode.value = parsedData["inviteCode"];
                current_room = parsedData["room"];
                page = 0;
                loadedMsgs = 0;
                loadingMsgs = false;
                
                document.getElementById("chat").display="none";
                noMoreMsgs = false;
                parsedData["messages"].forEach((msg)=>{
                    chatbox.prepend(generateMsg(msg));
                });
                parsedData["members"].forEach((user)=>{
                    if(!user["banned"])joinedUsers.append(generateMember(user));
                });
                if(parsedData["owner"]){
                    parsedData["members"].forEach((user)=>{
                        if(!user["owner"] && !user["banned"]) RS_joinedUsers.append(generateSettingsMember(user));
                        else if(user["banned"]) RS_bannedUsers.append(generateBannedSettingsMember(user));
                    });
                    document.getElementById("roomSetName").value = parsedData["roomName"];
                }
                let isLoaded = setInterval(()=>{
                    if(loadedMsgs>=parsedData["messages"].length){
                        //chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight;
                        chatbox.scrollTop = chatbox.scrollHeight*2;
                        loadingChat.style.display = "none"
                        document.getElementById("msgInput").style.display = "flex";
                        document.getElementById("chatMsg").disabled = document.getElementById("roomSettings").style.display == "" ;
                        document.getElementById("chat").display="flex";
                        document.getElementById("loadingProgress").style.width = "0%";
                        focusSend();
                        clearInterval(isLoaded);
                    }else document.getElementById("loadingProgress").style.width = loadedMsgs/parsedData["messages"].length*100+"%";
                }, 100);
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
            case "roomDeleted":{
                while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);
                while(joinedUsers.firstChild) joinedUsers.removeChild(joinedUsers.lastChild);
                current_room=""
                modals["deleteRoom"].hide();
                document.getElementById("roomName").innerText="";
                document.getElementById("roomSettingsBtn").style.display = "none";
                document.getElementById("leaveBtn").style.display = "none";
                closeRoomSettings();
                break;
            }
            case "newMsg":
                if(current_room==parsedData['room']){
                    const isScrolledToBottom = chatbox.scrollHeight - chatbox.clientHeight <= chatbox.scrollTop + 1;

                    chatbox.append(generateMsg(parsedData));

                    if (isScrolledToBottom){
                      chatbox.scrollTop = chatbox.scrollHeight - chatbox.clientHeight;
                    }
                    socket.send(JSON.stringify({room: parsedData['room'], type: "recieved"}));
                    if(parsedData["newUser"]) socket.send(JSON.stringify({id: parsedData['room'], type: "refreshData"}));
                }else {
                    document.getElementById(parsedData["room"]).children[0].style.display="";
                    document.getElementById(parsedData["room"]).children[0].innerText = Number(document.getElementById(parsedData["room"]).children[0].innerText)+1;
                    newMessageToast(parsedData);
                }
                break;
            case "userAction":
                if(current_room == parsedData["id"]){
                    switch(parsedData["action"]){
                        case "msgDelete":{
                            document.getElementById(parsedData["msgId"]).remove();
                            break;
                        }
                    }
                    socket.send(JSON.stringify({id: parsedData["id"], type: "refreshData"}));
                }
                    
                break;
            case "clearChat": // {room: roomid}
                while(chatbox.firstChild) chatbox.removeChild(chatbox.lastChild);
                while(joinedUsers.firstChild) joinedUsers.removeChild(joinedUsers.lastChild);
                if(parsedData["room"]) document.getElementById(parsedData["room"]).remove();
                current_room="";
                document.getElementById("roomName").innerText="";
                document.getElementById("roomSettingsBtn").style.display = "none";
                document.getElementById("leaveBtn").style.display = "none";
                break;
        }
        switch(parsedData['statusCode']){
            case 401: 
                fetch(domain+'/auth/refreshToken',{method: "POST", credentials: 'include'}).then((res)=>{
                    if(res.status==401) window.location.href = "https://chat.mikmik.xyz/login";
                    socket.close();
                    //connectSocket();
                });
                break;
            case 403:{
                generateToast(parsedData["msg"], "bg-danger", "Warning!")
                break;
            }
        }
    }
}

document.getElementById("pfp_upload").addEventListener('change', e=>{
    if(e.target.files.length){
        const modal = new bootstrap.Modal('#editPfp', {getInstance: true});
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

document.getElementById("uploadFile").addEventListener('change', e=>{
    if(e.target.files.length){
        let file = e.target.files[0];
        if(file.size > 10*1000*1000) generateToast("File over 10MB", "bg-danger", "Error uploading file");
        else{
            let formData = new FormData();
            formData.append("file", file);
            formData.append("room", current_room)
            fetch(domain+"/upload", {
                method: "POST",
                body: formData,
                credentials: 'include'
            }).then(
                res=>{
                    switch(res.status){
                        case 200:
                            return res.json();
                        case 413: generateToast("File over 10MB", "bg-danger", "Error uploading file"); break;
                        default: console.log(res);
                    }
                }
            ).then(
                data=>{
                    document.getElementById("chatMsg").value += " "+data['link'];
                }
            );
        }
    }
})

document.addEventListener("DOMContentLoaded", ()=>{
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))
    modals = {
        "createRoom": new bootstrap.Modal("#createRoomModal"),
        "deleteRoom": new bootstrap.Modal("#deleteRoomModal"),
        "confirmSettings": new bootstrap.Modal("#confirmSettingsModal"),
        "closeSettings": new bootstrap.Modal("#closeSettingsModal"),
        "editPfp": new bootstrap.Modal("#editPfpModal"),
        "joinRoom": new bootstrap.Modal("#joinRoomModal"),
        "transOwner": new bootstrap.Modal("#transOwnerModal")
    }
    connectSocket();
})