


var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.use(express.static(__dirname + '/client'));

var port = process.env.PORT || 3000;
http.listen(port, function() {
  console.log("Server is listening on port " + port);
});






function Blob(server, nodeId, x, y, mass, parent) {
	this.server = server;
	this.nodeId = nodeId;
	this.nodeType = -1; // 0- playerBlob, 1- food, 2-eject, 3-virus
	this.team = null;
	this.isAgitated = false;
	this.sendId = Math.random();
	
	this.x = x;
	this.y = y;
	this.mass = mass;
	this.time = Date.now();

	this._mass = mass;

	this.nick = "";
	
	this.parent = parent;
	this.hue = Math.random() * 360;

	this.boostDistance = 0;
	this.boostEngine = {
		x: 0,
		y: 0,
		angle: 0
	};
};

Blob.prototype.getSpeed = function() {
	return 15 * 1.6 / Math.pow(this.mass, 0.32);
};
Blob.prototype.getBoostSpeed = function() {
	return 15 * 2.6 * Math.pow(this.mass, 0.0422);
};
Blob.prototype.getSize = function() {
	return Math.sqrt(this.mass) * 10;
};
Blob.prototype.setBoost = function(angle) {
	var speed = this.getBoostSpeed();
	this.boostEngine = {
		x: Math.cos(angle) * speed,
		y: Math.sin(angle) * speed,
		angle: angle
	};
};
Blob.prototype.getBoostAngle = function() {
	return this.boostEngine.angle;
};
Blob.prototype.boostMove = function(delta) {
	this.x += this.boostEngine.x * delta;
	this.y += this.boostEngine.y * delta;

	this.boostEngine.x -= this.boostEngine.x * 0.05 * delta;
	this.boostEngine.y -= this.boostEngine.y * 0.05 * delta;
};
Blob.prototype.isBoosting = function() {
	return Math.hypot(this.boostEngine.x, this.boostEngine.y) > 15
};
Blob.prototype.borderCheck = function() {
	var xStart = 0;
	var xEnd = this.server.config.width;
	var yStart = 0;
	var yEnd = this.server.config.width;

	this.x = Math.min(xEnd, Math.max(this.x, xStart));
	this.y = Math.min(yEnd, Math.max(this.y, yStart));
};



// Hooks
Blob.prototype.canCombine = function() {
	return false;
};
Blob.prototype.onEat = function(prey) {
	this.mass += prey.mass;
};
Blob.prototype.onEaten = function(eater) {
	this.server.removeNode(this);
};
Blob.prototype.move = function() {
	// dddd
};
Blob.prototype.eat = function() {
	// dddd
};

function PlayerBlob() {
	Blob.apply(this, arguments);
	this.nodeType = 0;
};
PlayerBlob.prototype = new Blob();
PlayerBlob.prototype.decayMass = function(delta) {
	this.mass -= this.mass * 0.00005 * delta;
};
PlayerBlob.prototype.move = function(delta) {
	var mouse = this.parent.getMouse(this.x, this.y);
	var angle = mouse.angle;
	var vx = mouse.vx / (this.getSize() * 0.11);
	var vy = mouse.vy / (this.getSize() * 0.11);
	var speed = this.getSpeed();
	this.x += Math.cos(angle) * speed * Math.min(Math.pow(vx, 2), 1) * delta;
	this.y += Math.sin(angle) * speed * Math.min(Math.pow(vy, 2), 1) * delta;
};
PlayerBlob.prototype.eat = function() {
	var nodes = this.server.getNodesInRange(this.x, this.y);
	var selfParentId = this.parent.id;
	var ejectNodes = nodes.filter(function(a) {
		return a.nodeType == 0 ? a.parent.id != selfParentId : true;
	});

	for(var i = 0; i < ejectNodes.length; i++) {
		var check = ejectNodes[i];
		if(this.server.collisionHandler.canEat(this, check)) {
			this.onEat(check);
			check.onEaten(this);
		};
	};
};
PlayerBlob.prototype.canCombine = function() {
	var required = 0.15 * this.mass + this.server.config.baseTime;
	return Date.now() - this.time >= required;
};

function Virus() {
	Blob.apply(this, arguments);
	this.nodeType = 1;
	this.isAgitated = true;
};
Virus.prototype = new Blob();
Virus.prototype.onEat = function(prey) {
	this.mass += prey.mass;
	if(this.mass > this.server.config.virusMaxMass) {
		this.server.shootVirus(this, prey.getBoostAngle());
	}
};
Virus.prototype.eat = function() {
	var nodes = this.server.getNodesInRange(this.x, this.y);
	var ejectNodes = nodes.filter(function(a) {
		return a.nodeType == 3;
	});

	for(var i = 0; i < ejectNodes.length; i++) {
		var check = ejectNodes[i];
		if(this.server.collisionHandler.canEat(this, check)) {
			this.onEat(check);
			check.onEaten(this);
		};
	};
};
Virus.prototype.onEaten = function(eater) {
	Blob.prototype.onEaten.apply(this, arguments);

	this.server.addVirus(1);

	var numSplits = this.server.config.playerMaxSplit - eater.parent.blobs.length;
	var massLeft = eater.mass;

	if(numSplits <= 0) return;

	var massLeft = eater.mass;
	if (massLeft < 466) {
		var splitAmount = 1;
		while (massLeft > 36) {
    		splitAmount *= 2;
    		massLeft = eater.mass - splitAmount * 36;
		};
		var splitMass = eater.mass / splitAmount;
		for(var i = 0; i < Math.min(splitAmount, numSplits); i++) {
    		var angle = Math.random() * 6.28;
   		 	if (eater.mass <= 36) {
   		 		break;
   		 	}

   		 	this.server.createPlayerBlob(
				eater.x,
				eater.y,
				splitMass,
				angle,
				eater, eater.parent);
		};
	} else {
        var beginMass = eater.mass,
    		smallMass = 19,
  			splitMass = beginMass * 0.44 - smallMass * numSplits;	
        while (eater.mass > beginMass * 0.5 && splitMass > smallMass) {
            numSplits--;
            var angle = Math.random() * 6.28;
            this.server.createPlayerBlob(
				eater.x,
				eater.y,
				splitMass,
				angle,
				eater, eater.parent);
            splitMass *= 0.55;
        };
        for (var i = 0; i < numSplits; i++) {
            var angle = Math.random() * 6.28;
            this.server.createPlayerBlob(
				eater.x,
				eater.y,
				smallMass,
				angle,
				eater, eater.parent);
        };
    }
};



function Food() {
	Blob.apply(this, arguments);
	this.nodeType = 2;
};
Food.prototype = new Blob();
Food.prototype.onEaten = function() {
	Blob.prototype.onEaten.apply(this, arguments);
	this.server.addFood(1);
};

function Eject() {
	Blob.apply(this, arguments);
	this.nodeType = 3;
};
Eject.prototype = new Blob();
/* self feed

Eject.prototype.onEaten = function(eater) {
	Blob.prototype.onEaten.apply(this, arguments);
	eater.mass += this.mass * 0.343;
};
*/




function Player(server) {
	this.server = server;
	this.blobs = [];

	this.visibleNodes = [];
	this.movingVisibleNodes = [];
	this.addedVisibleNodes = [];
	this.removedVisibleNodes = [];

	this.nick = "";

	this.drawZoom = 1;
	this.centerX = 0;
	this.centerY = 0;

	this.rawMouseX = 0;
	this.rawMouseY = 0;
	this.screenWidth = 1920;
	this.screenHeight = 1080;
};
Player.prototype.setNick = function(n) {
	this.nick = n;
};
Player.prototype.getNick = function() {
	return this.nick == "" ? "Unnamed" : this.nick;
};
Player.prototype.onMouseMove = function(x, y) {
	this.rawMouseX = x;
	this.rawMouseY = y;
};

Player.prototype.onKeyDown = function(key) {
	if(key == 87) {
		var len = this.blobs.length;
		for(var i = 0; i < len; i++) {
			var blob = this.blobs[i];
			this.server.addEject(blob);
		};
	}
	if(key == 32) {
		var len = this.blobs.length;
		for(var i = 0; i < len; i++) {
			var blob = this.blobs[i];
			this.server.splitPlayerBlob(blob);
		};
	}
};
Player.prototype.onKeyUp = function(key) {
	// ???
};
Player.prototype.getMouse = function(x, y) {
	var relX = (this.centerX - x) * this.drawZoom;
	var relY = (this.centerY - y) * this.drawZoom;
	var x = relX + this.rawMouseX - this.screenWidth / 2;
	var y = relY + this.rawMouseY - this.screenHeight / 2;
	return {
		angle: Math.atan2(y, x),
		vx: x,
		vy: y
	};
};

Player.prototype.updateCenter = function(delta) {
	var totalX = 0, 
		totalY = 0, 
		totalSize = 0;

	var len = this.blobs.length;
	if(len == 0) {
		return;
	}

	for(var i = 0; i < len; i++) {
		var blob = this.blobs[i];

		totalX += blob.x;
		totalY += blob.y;
		totalSize += blob.getSize();
	};

	this.centerX = totalX / len;
	this.centerY = totalY / len;
	this.drawZoom = 1 / (Math.sqrt(totalSize) / Math.log(totalSize));

	var nodes = this.server.getNodesInRange(this.centerX, this.centerY);

	var self = this;
	nodes.forEach(function(n, i) {
		if(self.visibleNodes.indexOf(n) == -1) {
			self.addedVisibleNodes.push(n);
			self.visibleNodes.push(n);
		}
		self.visibleNodes.forEach(function(m, j) {
			if(nodes.indexOf(m) == -1) {
				self.removedVisibleNodes.push(m);
				self.visibleNodes.splice(j, 1);
			}
		});
	});

	this.movingVisibleNodes = nodes.filter(function(n) {
		return n.nodeType == 0 || n.nodeType == 1 || n.nodeType == 3;
	});
};




function Server() {
	this.collisionHandler = new CollisionHandler();
	this.nodes = [];
	this.players = [];

	this.config = {
		virusMaxMass: 180,
		virusMass: 100,
		ejectMass: 10,
		foodMass: 5,

		playerStartMass: 1302,
		playerMinMassForSplit: 20,
		playerMinMassForEject: 20,
		playerMaxMass: 20000,
		playerMaxSplit: 16,
		rangeWidth: 5000,
		rangeHeight: 5000,

		baseTime: 60000,

		width: 14000,
		height: 14000
	};
};
Server.prototype.createPlayer = function(id, nick) {
	var player = new Player(this);
	player.setNick(nick);

	// -=+++=---====
	player.id = id;
	// +++---=+++=0==


	var startBlob = this.createPlayerBlob(
		Math.random() * this.config.width,
		Math.random() * this.config.height,
		this.config.playerStartMass,
		0, null, player);

	this.players.push(player);
	return player;
};
Server.prototype.createPlayerBlob = function(x, y, mass, angle, parentBlob, parent) {
	var playerBlob = new PlayerBlob(this, parent.blobs.length, x, y, mass, parent);

	if(parentBlob) {
		playerBlob.hue = parentBlob.hue;
		parentBlob.mass -= mass;
		playerBlob.setBoost(angle);	
	}

	playerBlob.nick = parent.getNick();
	parent.blobs.push(playerBlob);
	return playerBlob;
};
Server.prototype.splitPlayerBlob = function(blob) {
	var numSplit = this.config.playerMaxSplit - blob.parent.blobs.length;
	if(numSplit <= 0 || blob.mass < this.config.playerMinMassForSplit) {
		return false;
	}

	var angle = blob.parent.getMouse(blob.x, blob.y).angle;
	this.createPlayerBlob(
		blob.x,
		blob.y,
		blob.mass * 0.5,
		angle,
		blob, blob.parent);
};
Server.prototype.shootVirus = function(virus, angle) {
	var shoot = new Virus(
		this, 
		this.nodes.length, 
		virus.x, 
		virus.y, 
		this.config.virusMass);

	shoot.hue = virus.hue;
	virus.mass = this.config.virusMass;

	shoot.setBoost(angle);
	this.nodes.push(shoot);
};

Server.prototype.addFood = function(number) {
	for(var i = 0; i < number; i++) {
		var blob = new Food(
			this, 
			this.nodes.length,
			Math.random() * this.config.width,
			Math.random() * this.config.height,
			this.config.foodMass);
		this.nodes.push(blob);
	};
};
Server.prototype.addVirus = function(number) {
	for(var i = 0; i < number; i++) {
		var blob = new Virus(
			this, 
			this.nodes.length,
			Math.random() * this.config.width,
			Math.random() * this.config.height,
			this.config.virusMass);
		this.nodes.push(blob);
	};
};
Server.prototype.addEject = function(blob) {
	if(blob.mass < this.config.playerMinMassForEject)
		return;

	var space = 50;
	var angle = blob.parent.getMouse(blob.x, blob.y).angle;
	var radius = blob.getSize();
	var ejectBlob = new Eject(
		this, 
		this.nodes.length,
		blob.x + Math.cos(angle) * (radius + space),
		blob.y + Math.sin(angle) * (radius + space),
		this.config.ejectMass);
	
	blob.mass -= this.config.ejectMass;
	ejectBlob.hue = blob.hue;
	ejectBlob.setBoost(angle);
	this.nodes.push(ejectBlob);
};
Server.prototype.removePlayer = function(player) {
	var index = this.players.indexOf(player);
	if(index > -1) {
		this.players.splice(index, 1);
	}
};
Server.prototype.removeNode = function(node) {
	if(node.nodeType != 0) {
		this.nodes.splice(node.nodeId, 1);
		for(var i = 0; i < this.nodes.length; i++) {
			var nd = this.nodes[i];
			nd.nodeId = i;
		};
	} else {
		node.parent.blobs.splice(node.nodeId, 1);
		for(var i = 0; i < node.parent.blobs.length; i++) {
			var nd = node.parent.blobs[i];
			nd.nodeId = i;
		};
	}
};
Server.prototype.getNodesInRange = function(x, y) {
	var xStart = x - this.config.rangeWidth / 2;
	var xEnd = x + this.config.rangeWidth / 2;
	var yStart = y - this.config.rangeHeight / 2;
	var yEnd = y + this.config.rangeHeight / 2;

	var allNodes = this.nodes;
	for(var i = 0; i < this.players.length; i++) {
		var plyr = this.players[i];
		var nodes = plyr.blobs;
		allNodes = allNodes.concat(nodes);
	};

	return allNodes.filter(function(a) {
		return a.x > xStart && a.x < xEnd && a.y > yStart && a.y < yEnd;
	});
};

Server.prototype.getLeaders = function() {
	var masses = [];
	for(var i = 0; i < this.players.length; i++) {
		var player = this.players[i];
		var sum = 0;
		for(var j = 0; j < player.blobs.length; j++) {
			sum += player.blobs[j].mass;
		};
		var nick = player.getNick();
		masses.push({
			nick: nick,
			mass: sum
		});
	};

	return masses.sort(function(a, b) {
		return b.mass - a.mass;
	}).slice(0, 10).map(function(c) {
		return c.nick;
	});
};
Server.prototype.lastUpdateTime = Date.now();
Server.prototype.getDelta = function() {
	return Date.now() - this.lastUpdateTime;
};
Server.prototype.update = function() {
	var currDelta = this.getDelta() / 16; // For making the speed right

    for(var i = 0; i < this.players.length; i++) {
		var player = this.players[i];
		player.updateCenter(currDelta);

		for(var x = 0; x < player.blobs.length; x++) {
			var blob = player.blobs[x];

			// Autosplit mechanism
			if(blob.mass >= this.config.playerMaxMass) {
				this.createPlayerBlob(
					blob.x, 
					blob.y,
					blob.mass / 2,
					Math.random() * 2 * Math.PI,
					blob, blob.parent);
			};

			blob.borderCheck();
			blob.eat();
			blob.decayMass(currDelta);
			blob.move(currDelta);
			blob.boostMove(currDelta);
		};

		for(var j = 0; j < player.blobs.length; j++) {
			for(var k = 0; k < player.blobs.length; k++) {
				var blobA = player.blobs[j];
				var blobB = player.blobs[k];

				if(k != j) {
					this.collisionHandler.pushApart(blobA, blobB, currDelta);
					this.collisionHandler.combinePlayer(blobA, blobB);
				}
			};
		};
	};

	for(var i = 0; i < this.nodes.length; i++) {
		var node = this.nodes[i];

		node.borderCheck();
		node.eat();
		node.boostMove(currDelta);
		node.move(currDelta);
	};

	this.lastUpdateTime = Date.now();
};





//
// -=-====------========--------==--
//		colllision hanfdler
// -======-=====----=====-----=====-==


function CollisionHandler() {
	this.eatMassFactor = 0.2;
	this.eatDistFactor = 1;
};
CollisionHandler.prototype.isOverlapping = function(blob, check) {
	if(!blob || !check) {
		return;
	}
	var x = check.x - blob.x;
	var y = check.y - blob.y;
	var distance = Math.hypot(x, y);

	var maxDistance = blob.getSize() + check.getSize();
	if(distance < maxDistance) {
		return {
			x: x,
			y: y, 
			distance: distance,
			maxDistance: maxDistance,
			squared: x * x + y * y
		};
	} else 
		return false;
};
CollisionHandler.prototype.canEat = function(eater, check) {
	if(!eater || !check) {
		return;
	}

	var overlap = this.isOverlapping(eater, check);
	var maxDistance = Math.pow(eater.mass + check.mass, 0.498888) * 10
	var minMass = 1.15 * check.mass;

	var eatDistance = eater.getSize() - check.getSize() / 3;
    if (overlap.squared <= eatDistance * eatDistance) {
        if(eater.mass > minMass) {
			return true;
		} else {
			return false;
		}
    }
	
	
};
CollisionHandler.prototype.pushApart = function(blobA, blobB, delta) {
	if(!blobA || !blobB) {
		return;
	}

	var overlap = this.isOverlapping(blobA, blobB);
	if(!overlap) {
		return;
	}

	var p = overlap.maxDistance - overlap.distance;
	if(p <= 0) {
		return;
	}


	var px = overlap.x / overlap.distance * p;
	var py = overlap.y / overlap.distance * p;
  	
  	var totalMass = blobA.getSize() + blobB.getSize();
  	var invTotalMass = 1 / totalMass;

  	var impulseA = blobA.getSize() * invTotalMass;
  	var impulseB = blobB.getSize() * invTotalMass;

	var isBoosting = blobA.isBoosting() || blobB.isBoosting();
	var canCombine = blobA.canCombine() && blobB.canCombine();

	if(!isBoosting && !canCombine) {
		blobA.x -= px * impulseB * 0.1 * delta;
		blobA.y -= py * impulseB * 0.1 * delta;
		blobB.x += px * impulseA * 0.1 * delta;
		blobB.y += py * impulseA * 0.1 * delta;
	} else {
		return false;
	}
};
CollisionHandler.prototype.combinePlayer = function(blobA, blobB) {
	if(!blobA || !blobB) {
		return;
	}

	var overlap = this.isOverlapping(blobA, blobB);
	var maxDistance = Math.pow(blobA.mass + blobB.mass, 0.498888) * 10;
	var isBoosting = blobA.isBoosting() || blobB.isBoosting();
	var canCombine = blobA.canCombine() && blobB.canCombine();
	if(overlap.distance < maxDistance && !isBoosting && canCombine) {
		if(blobA.mass > blobB.mass) {
			blobA.onEat(blobB);
			blobB.onEaten(blobA);
		} else {
			blobB.onEat(blobA);
			blobA.onEaten(blobB);
		}
	} else {
		return false;
	}
};




/*var servers = {
	ffa: new Server(),
	instant: new Server()
};

servers.instant.config.playerMaxSplit = 32;
servers.instant.config.baseTime = 700;

for(var i in servers) {
	var mode = servers[i];
	mode.addFood(1000);
	mode.addVirus(30);
};
*/

var server = new Server();
server.addFood(1000);
server.addVirus(30);

var sockets = {};


function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};


io.on("connection", function(socket) {
	// var player = server.createPlayer(socket.id, "𐍃𐌄𐌗", "");
	sockets[socket.id] = socket;

	var player = new Player(server);
	player.joined = false;
	player.id = socket.id;
	server.players.push(player);

	socket.on("join game", function(d) {
		if(socket.joined) {
			return;
		}

		var servKey = d[0];
		var nick = d[1];

		// player.server = servers[key];

		player.setNick(nick);

		player.joined = true;
		socket.emit("joined");

		socket.on("msg", function(m) {
			var d = ["client", escapeHtml(player.getNick()), escapeHtml(m)];
			io.sockets.emit("msg", d);
		});
		

		var b  = server.createPlayerBlob(
			Math.random() * server.config.width,
			Math.random() * server.config.height,
			server.config.playerStartMass,
			0, null, player);

		

		var m = ["game", "", `${ escapeHtml(player.getNick()) } joined the game.`];
		socket.broadcast.emit("msg", m);


		var init = [];

		player.visibleNodes.forEach(function(b) {
			init.push([
				b.sendId,
	 			Math.round(b.x),
	 			Math.round(b.y),
	 			b.nick,
	 			Math.round(Math.sqrt(b.mass) * 10),
	 			Math.round(b.hue),
	 			b.isAgitated,
	 			b.nodeType]);
		})
		socket.emit("init blobs", init);


		console.log("connected");
		console.log("players: " + server.players.length);


	});

	socket.on("disconnect", function() {
		var d = ["game", "", `${escapeHtml(player.getNick())} left the game.`];
		socket.broadcast.emit("msg", d);

		delete sockets[socket.id];
		player.server.removePlayer(player);
	});

	socket.on("width and height", function(d) {
		player.screenWidth = d[0];
		player.screenHeight = d[1];
	});
	socket.on("input mouse", function(data) {
		player.onMouseMove(data[0], data[1]);
	});
	socket.on("input keyup", function(data) {
		player.onKeyUp(data);
	});
	socket.on("input keydown", function(data) {
		player.onKeyDown(data);
	});


});


setInterval(function() {
	/*for(var i in servers) {
		var server = servers[i];
		server.update();
	};*/
	
	server.update();

	for(var key in sockets) {
		var socket = sockets[key];


		var player = server.players.find(function(a) {
			return a.id == socket.id;
		});

		var add = [];

		player.addedVisibleNodes.forEach(function(b) {
			add.push([
				b.sendId,
	 			Math.round(b.x),
	 			Math.round(b.y),
	 			b.nick,
	 			Math.round(Math.sqrt(b.mass) * 10),
	 			Math.round(b.hue),
	 			b.isAgitated,
	 			b.nodeType]);
		});

		socket.emit("add blobs", add);
		player.addedVisibleNodes = [];

		var remove = [];

		player.removedVisibleNodes.forEach(function(b) {
			remove.push(b.sendId);
		});

		socket.emit("remove blobs", remove);
		player.removedVisibleNodes = [];


		var move = [];
		player.movingVisibleNodes.forEach(function(b) {
			move.push([
				b.sendId,
	 			Math.round(b.x),
	 			Math.round(b.y),
	 			Math.round(Math.sqrt(b.mass) * 10)]);
		});

		socket.emit("move blobs", move);
	 	socket.emit("leaders", server.getLeaders());
		
	 	if(player.blobs.length == 0 && player.joined == true) {
	 		socket.emit("dead");
	 		socket.joined = false;
	 		continue;
	 	}

		var translateX = player.centerX * player.drawZoom - player.screenWidth / 2;
		var translateY = player.centerY * player.drawZoom - player.screenHeight / 2;

		
		var d = [Math.round(translateX), Math.round(translateY), player.drawZoom];
		socket.emit("center and zoom", d);
	}
}, 1000/20);



