const Paho = require("paho-mqtt");

function KexxuEye(deviceId, deviceIpAddress){
    this.debug = false; // set to true to get all the MQTT output of the device in the console

    if(!deviceIpAddress){
      // TODO get ip address from server
    }

    this.ipAddress = deviceIpAddress;
    this.deviceId = deviceId;
    this.client = {}; // mqtt socket client
    this.status = "not connected";
    this.statusCallback = function(){}; // overwrite this to get status updates
    //this.positionCallback = function(x,y){console.log("position", x, y);}; // overwrite this to get position updates
    //this.markersCallback = function(left, right){console.log("markers", left, right);}; // overwrite this to get position updates

    // calibration from the glasses to the screen
    this.calibration = {
        bx: 0, // add
        by: 0,
        r: 0.0, // rotate
        ax: 0.0, // mulitiply
        ay: 0.0
    }

    this.lastX = 0.0;
    this.lastY = 0.0;

    this.locHist = [];

    this.lastXcal = 0.0;
    this.lastYcal = 0.0;
    this.calPoints = [];

    // least squares fit calibration using calibration points
    this.calibration2 = {
        ax: 1,
        ay: 1,
        bx: 0,
        by: 0,
    }
}

KexxuEye.prototype.pushLocHist = function(x, y){
    this.locHist.unshift({x:x, y:y});
    if(this.locHist.length > 20){
        this.locHist.pop();
    }
}

KexxuEye.prototype.avgLoc = function(n){
    let x = 0;
    let y = 0;
    let n2 = 0;
    for(let i = 0; i < n && i < this.locHist.length; i++){
        x += this.locHist[i].x;
        y += this.locHist[i].y;
        n2 += 1;
    }
    x /= n2;
    y /= n2;

    return {x:x, y:y}
}


KexxuEye.prototype.fitCalPoints = function(){
    let values_x1 = [];
    let values_x2 = [];
    let values_y1 = [];
    let values_y2 = [];
    for(let i = 0; i < this.calPoints.length; i++){
        let p = this.calPoints[i];
        values_x1.push(p.x2);
        values_x2.push(p.x1);
        values_y1.push(p.y2);
        values_y2.push(p.y1);
    }
    // fit x
    let calx = this.leastSquares(values_x1, values_x2);
    console.log("Least squares calibration x:", calx);
    this.calibration2.ax = calx.m;
    this.calibration2.bx = calx.b;
    // fit y
    let caly = this.leastSquares(values_y1, values_y2);
    console.log("Least squares calibration y:", caly);
    this.calibration2.ay = caly.m;
    this.calibration2.by = caly.b;
    // clean
    this.calPoints = [];
}

KexxuEye.prototype.leastSquares = function(values_x, values_y){
    let x_sum = 0;
    let y_sum = 0;
    let xy_sum = 0;
    let xx_sum = 0;
    let count = 0;

    /*
     * The above is just for quick access, makes the program faster
     */
    let x = 0;
    let y = 0;
    let values_length = values_x.length;

    if (values_length != values_y.length) {
        throw new Error('Least squares: The parameters values_x and values_y need to have same size!');
    }

    /*
     * Above and below cover edge cases
     */
    if (values_length === 0) {
        throw new Error('Least squares: No values provided!');
    }

    /*
     * Calculate the sum for each of the parts necessary.
     */
    for (let i = 0; i< values_length; i++) {
        x = values_x[i];
        y = values_y[i];
        x_sum+= x;
        y_sum+= y;
        xx_sum += x*x;
        xy_sum += x*y;
        count++;
    }

    /*
     * Calculate m and b for the line equation:
     * y = x * m + b
     */
    let m = (count*xy_sum - x_sum*y_sum) / (count*xx_sum - x_sum*x_sum);
    let b = (y_sum/count) - (m*x_sum)/count;
    
    return {m: m, b: b}
}

KexxuEye.prototype.rotate = function(cx, cy, x, y, radians) {
    //let radians = (Math.PI / 180) * angle,
    cos = Math.cos(radians),
    sin = Math.sin(radians),
    nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
    ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
    return [nx, ny];
}

KexxuEye.prototype.setStatus = function(status){
    this.status = status;
    console.log(status);
    this.statusCallback(this.status);
}

KexxuEye.prototype.connect = function(){
    let self = this;
    self.setStatus("connecting to device: "+self.deviceId+" on ip address: "+self.ipAddress);

    // Create a client instance
    self.client = new Paho.Client(self.ipAddress, Number(3000), "/mqtt", "KexxuEye-javascript-client");

    // set callback handlers
    self.client.onConnectionLost = self.onConnectionLost.bind(self);
    self.client.onMessageArrived = self.onMessageArrived.bind(self);

    // connect the client
    self.client.connect({onSuccess: self.onConnect.bind(self), useSSL: false, timeout: 1});
}


// called when the client connects
KexxuEye.prototype.onConnect = function() {
    let self = this;
    // Once a connection has been made, make a subscription and send a message.
    console.log("onConnect ", self.deviceId);
    self.setStatus("connected")
    self.client.subscribe("devices/"+self.deviceId+"/#");

    //self.client.subscribe("#");
}

KexxuEye.prototype.sendMessage = function(topic, msg){
    let self = this;
    let message = new Paho.Message(msg);
    message.destinationName = topic;
    self.client.send(message);
}

// called when the client loses its connection
KexxuEye.prototype.onConnectionLost = function(responseObject) {
    let self = this;
    if (responseObject.errorCode !== 0) {
        self.setStatus("connection lost");
        console.log("onConnectionLost:"+responseObject.errorMessage);
    }
}

// called when a message arrives
KexxuEye.prototype.onMessageArrived = function(msg) {
    let self = this;
    if(self.debug){
        console.log(msg.topic, msg.payloadString);
    }
    if(msg.topic.endsWith("/eyetracking")){
        let js = JSON.parse(msg.payloadString);
        let x = js["pupil_rel_pos_x"];
        let y = js["pupil_rel_pos_y"];
        self.positionUpdate(x,y);
    }
    if(msg.topic.endsWith("/markers")){
        let js = JSON.parse(msg.payloadString);
        let left = {found: js["left_found"], x: js["left_x"], y: js["left_y"]};
        let right = {found: js["right_found"], x: js["right_x"], y: js["right_y"]};
        self.markersUpdate(left, right);
    }
}

KexxuEye.prototype.positionUpdate = function(x, y){
    //console.log(x, y);

    // map to the same pixel space as the scene cam (1280x720 starting from center)
    x = parseInt((-x * 640)+640);
    y = parseInt((y * 360)+360);
    x *= this.calibration.a;
    y *= this.calibration.a;
    x += this.calibration.bx;
    y += this.calibration.by;
    // adjust for rotation from as if the left marker is at 0,0
    let rot = this.rotate(600, 70, x, y, this.calibration.r);
    x = rot[0];
    y = rot[1];
    this.lastX = x;
    this.lastY = y;
   

    // add least squares fit callibration
    x = x*this.calibration2.ax+this.calibration2.bx;
    y = y*this.calibration2.ay+this.calibration2.by;
    this.lastXcal = x;
    this.lastYcal = y;

    // smooth with low pass filter (avg last n locations)
    this.pushLocHist(x, y);
    let avgLoc = this.avgLoc(5);

    if(!this.isCalibrating){
      let dot1 = document.getElementById("kexxu-eye-location");
      dot1.style.left = (x-15) + "px";
      dot1.style.top = (y-15) + "px";

      let dot2 = document.getElementById("kexxu-eye-location-smooth");
      dot2.style.left = (avgLoc.x-15) + "px";
      dot2.style.top = (avgLoc.y-15) + "px";
    }
}
KexxuEye.prototype.markersUpdate = function(left, right){

    //let markers = document.getElementById("markers");
    //markers.innerHTML = "left: "+left.found+" "+left.x+", "+left.y+
    //          " right: "+right.found+" "+right.x+", "+right.y;

    if(left.found && right.found){
        // calculate rotation
        this.calibration.r = Math.atan2(right.y-left.y, right.x-left.x);
        // calculate the zoom level
        this.calibration.a = 400 / (right.x-left.x); // TODO add rotation into this
        left.x *= this.calibration.a;
        left.y *= this.calibration.a;
        right.x *= this.calibration.a;
        right.y *= this.calibration.a;
        // calculate offset
        this.calibration.bx = 600 - left.x;
        this.calibration.by = 70 - left.y;
        left.x += this.calibration.bx;
        right.x += this.calibration.bx;
        left.y += this.calibration.by;
        right.y += this.calibration.by;
        // adjust for rotation from as if the left marker is at 0,0
        let rot = this.rotate(600, 70, right.x, right.y, this.calibration.r);
        right.x = rot[0];
        right.y = rot[1];
    }

    let m1 = document.getElementById("kexxu-eye-m1");
    m1.style.left = (left.x-15) + "px";
    m1.style.top = (left.y-15) + "px";
    //m1.innerHTML = left.x+"<br>"+left.y;

    let m2 = document.getElementById("kexxu-eye-m2");
    m2.style.left = (right.x-15) + "px";
    m2.style.top = (right.y-15) + "px";
    //m2.innerHTML = right.x+"<br>"+right.y;

    
}

module.exports = KexxuEye;
