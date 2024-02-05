const domain="https://chat.mikmik.xyz/api";

let log_proc = false;
let reg_proc = false;

function enterLogin(event){
    if(event.key=="Enter" && !log_proc) login();
}

function enterRegister(event){
    if(event.key=="Enter"&& !reg_proc) register();
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

function login(){
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    if(username != "" && password != ""){

    document.getElementById("login_btn").disabled = true;
    log_proc=true;

    fetch(domain+"/auth/login", {
        method: "POST",
        body: JSON.stringify({
            username: username,
            password: password
        }),
        headers: {
            "Content-type": "application/json; charset=UTF-8",
        },
        credentials: 'include'
    }).then((res)=>{
        log_proc=false;
        document.getElementById("login_btn").disabled = false;
        switch(res.status){
            case 200: window.location.href = "https://chat.mikmik.xyz/"; break;
            case 401: generateToast("Incorrect password/username", "bg-danger", "Warning"); break;
            default: console.log(res);
        }
    });
    }
}

function register(){
    const username = document.getElementById("usernameReg").value;
    const password = document.getElementById("passwordReg").value;
    const email = document.getElementById("email").value;
    const password2 = document.getElementById("passwordReg2").value;

    if(password==password2 && username!="" && email!="" && password!=""){
        reg_proc=true;
        document.getElementById("register_btn").disabled=true;
        fetch(domain+"/auth/register",{
            method: "POST",
            body: JSON.stringify({
                username: username,
                password: password,
                email: email
            }),
            headers: {
                "Content-type": "application/json; charset=UTF-8",
            },
            credentials: 'include'
        }).then((res)=>{
            reg_proc=false;
            document.getElementById("register_btn").disabled = false;
            switch(res.status){
                case 200: window.location.href = "https://chat.mikmik.xyz/"; break;
                case 409: generateToast("Username already in use", "bg-danger", "Warning"); break;
                case 406: generateToast("Email already in use", "bg-danger", "Warning"); break;
                default: console.log(res);
            }
        });
    }else if(password!=password2) generateToast("Passwords do not match", "bg-warning", "Warning")
}

function toggleVisibility(btn){
    btn.children[0].style.display = btn.children[0].style.display == "none" ? "" : "none"; 
    btn.children[1].style.display = btn.children[1].style.display == "none" ? "" : "none"; 
    btn.parentElement.children[0].type = btn.parentElement.children[0].type == "password" ? "text" : "password"; 
}