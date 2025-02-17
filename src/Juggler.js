/* jshint -W097 */
'use strict';

function Juggler(options) {
  this.propType = options.propType;

  // Keeps track of where the hands should be and what throws need to be made
  this.hands = new Hands(options.siteswap);

  this.headStyle = options.styles.head;
  this.bodyStyle = options.styles.body;

  // Spin stuff
  this.spins = (options.spinOn0s || options.spinOn2s) && this.generateSpins(this.hands, options.spinOn0s, options.spinOn2s);
  this.spinIndex = 0;
  this.spinning = false;
  this.spinAmounts = [];
  this.spinAIndex = 0;
  this.spinRotation = 0;

  // How many frames between throws
  this.timeUnit = Math.round(options.fps / options.throwsPerSecond);

  // Head bounce & balance
  this.headBounce = options.headBounce ? new HeadBounce(this.timeUnit, this.hands.left, options.spinOn0s, options.spinOn2s, options.styles.headBounce) : false;
  this.clubBalance = options.clubBalance ? new ClubBalance(this.timeUnit, options.styles.clubBalance) : false;

  this.width = options.width;
  this.height = options.height;

  this.rotation = 0;

  // Try to fill the canvas nicely
  this.calculateScale(this.width, this.height);

  this.a = this.calculateAcceleration(this.scale * options.height / 16 * (2 * this.hands.max - 3), 0.5 * this.hands.max * this.timeUnit);

  if (this.propType !== 'b')
    this.scale *= 0.75;

  // Keeps track of the props being juggled
  this.props = new Props(this.propType, this.timeUnit, this.a, this.scale, this.height, this.hands, options.styles.props);

  // For knowing when to throw
  this.count = 1;

  this.patternLength = this.hands.left.length * this.timeUnit;
}

Juggler.prototype.update = function() {
  // Move hands
  let spinLength = -1;
  if (this.spinAmounts.length > 0 && this.spinAIndex === 0)
    spinLength = this.spinAmounts.length;

  this.hands.update(this.count, this.timeUnit, this.height, this.scale, spinLength);

  // Move body
  this.move();

  // Move props
  this.props.update();
  
  if (this.headBounce) this.headBounce.update(this.a);
  if (this.clubBalance) this.clubBalance.update(this.scale, this.height);

  // Make new throws
  if (this.count % this.timeUnit === 0) {
    const throws = this.hands.getNextThrows();

    this.props.makeThrows('left', throws.left, this.hands);
    this.props.makeThrows('right', throws.right, this.hands);
  }

  this.count++;
};

Juggler.prototype.draw = function(ctx) {
  ctx.lineWidth = 2;

  const centerX = this.width / 2;

  // Juggler
  const headBob = this.scale * this.height * Math.sin(this.count / (this.timeUnit / 2)) / 800;
  const headBounceRecoil = this.headBounce && this.headBounce.getHeadRecoil() * 10 * this.scale;

  if (this.rotation <= 90 || 270 < this.rotation) {
    this.drawBody(ctx, centerX, 9 * this.height / 10, this.rotation + this.spinRotation, headBob - headBounceRecoil);
  }

  const forehead = 9 * this.height / 10 - 41*(this.scale*this.height)/160;
  if (this.headBounce) {
    this.headBounce.draw(ctx, centerX, forehead, this.rotation, 2 * this.scale, this.height);
  }
   
  if (this.clubBalance) {
    this.clubBalance.draw(ctx, centerX, forehead + headBob - headBounceRecoil - this.scale * this.height/20, this.scale, this.height);
  }

  const propsY = 9 * this.height / 10 - (this.scale * this.height / 80);
  this.props.draw(ctx, centerX, propsY, this.rotation);

  if (90 < this.rotation && this.rotation <= 270) {
    this.drawBody(ctx, centerX, 9 * this.height / 10, this.rotation + this.spinRotation, headBob - headBounceRecoil);
  }
};

Juggler.prototype.move = function() {
  if (!this.spins) return;

  if (this.spinning) {
    this.spinRotation += this.spinAmounts[this.spinAIndex];

    if (++this.spinAIndex >= this.spinAmounts.length) {
      this.spinning = false;
    }
  }

  if (this.count % this.timeUnit === this.timeUnit / 2) {
    if (this.nextSpin) {
      this.startSpin(this.nextSpin);
      delete this.nextSpin;
    }
    else {
      const spin = this.spins[this.spinIndex];
      const type = spin && spin.type;
      if (type === 't') this.startSpin(spin);
      if (type === 'c') this.nextSpin = spin;
    }
    
    if (++this.spinIndex >= this.spins.length)
      this.spinIndex = 0;
  }
};

Juggler.prototype.startSpin = function(spin) {
  // How far to spin through
  const degrees = spin.turns * 360;
  // How long the spin will take
  let frames = 2 * spin.turns * this.timeUnit - 1;
  if (spin.type === 'c') frames -= this.timeUnit / 2;

  // Set defaults
  this.spinAmounts = [];
  this.spinAIndex = 0;

  let sum = 0;
  for (let i = 0; i < frames; i++) {
    this.spinAmounts[i] = Math.sin((i*Math.PI) / frames);
    sum += this.spinAmounts[i];
  }

  const scale = degrees / sum;

  for (let i = 0; i < frames; i++)
    this.spinAmounts[i] *= scale;

  this.spinning = true;
};

function Spin(type, turns) {
  this.type = type;
  this.turns = turns;
}

Juggler.prototype.generateSpins = (hands, spinOn0s, spinOn2s) => {
  let throwString = '';
  for (let i = 0; i < hands.period; i++) {
    const allThrows = hands.left[i].concat(hands.right[i]).map(t => {
      const v = Math.abs(t.value);
      return (v > 9) ? 9 : v;
    });
    throwString += Math.max(...allThrows);
  }

  let spinString = '';
  for (let i = 0; i < hands.period - 1; i++) {
    const candidate = throwString.slice(i, i + 2);

    if (spinOn2s && ['22', '20'].includes(candidate)) {
      spinString += 'c0';
      
      hands.left[i].concat(hands.right[i]).forEach(t => {
        if (t.value === 2) t.active = false;
      });
      hands.left[i + 1].concat(hands.right[i + 1]).forEach(t => {
        if (t.value === 2) t.active = false;
      });

      i++;
    }
    else if (spinOn0s && candidate === '00') {
      spinString += 't0';
      i++;
    }
    else {
      spinString += '0';
    }
  }

  const spins = [];
  for (let i = 0; i < hands.period; i++) {
    const type = spinString[i];
    
    if (type === '0') spins.push(false);
    else {
      spins.push(new Spin(type, 1));

      for (let j = i + 2; j < hands.period; j += 2) {
        const type = spinString[j];
        if (type === 't') {
          spins[i].turns++;
          spins.push(false);
          spins.push(false);
        }
        else break;
      }
      i = spins.length - 1;
    }
  }

  return spins;
};

Juggler.prototype.rotate = function(degrees) {
  this.rotation = (this.rotation + 360 + degrees) % 360;
};

Juggler.prototype.calculateScale = function(w, h) {
  // Max amount of screen to fill with the juggler and pattern
  const availableWidth = 0.9 * w;
  const availableHeight = 0.85 * h;

  this.scale = Math.abs(availableHeight / (h / 16 * (2 * this.hands.max - 3)));

  if ((h * this.scale) / 4 > availableWidth)
    this.scale = (4 * availableWidth) / h;
};

Juggler.prototype.calculateAcceleration = function(s, t) {
  return (2 * s) / (t * t);
};

Juggler.prototype.drawBody = function(ctx, x, y, r, headBob) {
  const pos = this.hands.positions;
  const props = this.props.props;
  const headMoveX = this.clubBalance && this.clubBalance.getHeadReaction();

  r %= 360;
  const h = this.scale * this.height / 4;
  const w = this.scale * this.height / 8;
  
  const yCos = Math.cos(r/180 * Math.PI);
  const ySin = Math.sin(r/180 * Math.PI);
  
  ctx.save();
  ctx.translate(x, y);
  
  // Head image
  // drawImage(ctx, headMoveX, -36*h/40 + headBob, 0, this.scale, 3.2*this.height, r, true);

  // Head
  ctx.fillStyle = this.headStyle.fill;
  ctx.strokeStyle = this.headStyle.stroke;
  ctx.beginPath();
  ctx.moveTo(yCos * -5*h/36 + headMoveX, -33*h/40 + headBob);
  ctx.bezierCurveTo(yCos * -5*h/36 + headMoveX, -41*h/40 + headBob,
    yCos * 5*h/36 + headMoveX, -41*h/40 + headBob,
    yCos * 5*h/36 + headMoveX, -33*h/40 + headBob);
  ctx.bezierCurveTo(yCos * 5*h/36 + headMoveX, -25*h/40 + headBob,
    yCos * -5*h/36 + headMoveX, -25*h/40 + headBob,
    yCos * -5*h/36 + headMoveX, -33*h/40 + headBob);
  ctx.fill();
  ctx.stroke();

  let drawLeftArm = () => {
    const handX = yCos * (pos.left.x - 6*w/8) + ySin * h/3;
    const handY = -5*h/50 + pos.left.y;

    ctx.beginPath();
    ctx.strokeStyle = this.bodyStyle.stroke;
    ctx.moveTo(yCos * -w/2, -5*h/8);
    ctx.lineTo(yCos * (-pos.left.x/8 - 6*w/8), -h/7); // Elbow
    ctx.lineTo(handX, handY); // Hand
    ctx.stroke();

    // Props in left hand
    if (props.left.length) {
      const split = (this.propType === 'r') ? h/20 : (props.left.length === 1) ? 0 : pos.left.y;

      const startX = yCos * (pos.left.x - 6*w/8) + ySin * ((this.propType === 'r') ? h/2 : h/3); // - ((this.propType === 'r') ? (split / 2) : 0);
      const startY = handY - ((this.propType === 'r') ? 0 : (split / 2));

      for (let i = 0; i < props.left.length; i++) {
        const holdingX = startX + ((this.propType === 'r') ? i * (split / props.left.length) : 0);
        let holdingY = startY + ((this.propType === 'r') ? 0 : i * (split / props.left.length));

        let rotation = r;
        if (this.propType === 'c') {
          rotation = 270 - 0.5 * pos.left.y;
          holdingY += 0.5 * pos.left.y;
        } else if (this.propType === 'i') {
          rotation = props.left[0].r;
        }

        drawProp(ctx, this.propType, holdingX, holdingY, rotation, 0, this.scale, this.height, props.left[i].style);
        // props.left[i].draw(ctx, holdingX, holdingY, rotation, this.scale, this.height);
      }
    }
  };

  let drawRightArm = () => {
    const handX = yCos * (pos.right.x + 6*w/8) + ySin * h/3;
    const handY = -5*h/50 + pos.right.y;

    ctx.beginPath();
    ctx.strokeStyle = this.bodyStyle.stroke;
    ctx.moveTo(yCos * w/2, -5*h/8);
    ctx.lineTo(yCos * (6*w/8 - pos.right.x/8), -h/7); // Elbow
    ctx.lineTo(handX, handY); // Hand
    ctx.stroke();
    
    // Props in right hand
    if (props.right.length) {
      const split = (this.propType === 'r') ? h/20 : (props.right.length === 1) ? 0 : pos.right.y;
      
      const startX = yCos * (pos.right.x + 6*w/8) + ySin * ((this.propType === 'r') ? h/2 : h/3); //  - ((this.propType === 'r') ? (split / 2) : 0);
      const startY = handY - ((this.propType === 'r') ? 0 : (split / 2));

      for (let i = 0; i < props.right.length; i++) {

        const holdingX = startX + ((this.propType === 'r') ? i * (split / props.right.length) : 0);
        let holdingY = startY + ((this.propType === 'r') ? 0 : i * (split / props.right.length));

        let rotation = r;
        if (this.propType === 'c') {
          rotation = 270 - 0.5 * pos.right.y;
          holdingY += 0.5 * pos.right.y;
        } else if (this.propType === 'i') {
          rotation = props.right[0].r;
        }

        drawProp(ctx, this.propType, holdingX, holdingY, rotation, 0, this.scale, this.height, props.right[i].style);
        // props.right[i].draw(ctx, holdingX, holdingY, rotation, this.scale, this.height);
      }
    }
  };

  // TODO improve this
  drawRightArm = drawRightArm.bind(this);
  drawLeftArm = drawLeftArm.bind(this);

  if (r >= 180) {
    drawLeftArm();
  } else {
    drawRightArm();
  }
  
  // Body
  ctx.fillStyle = this.bodyStyle.fill;
  ctx.strokeStyle = this.bodyStyle.stroke;
  ctx.beginPath();
  ctx.moveTo(yCos * -w/2, -5*h/8);
  ctx.lineTo(yCos * w/2, -5*h/8);
  ctx.lineTo(yCos * 7*w/20, 0);
  ctx.lineTo(yCos * -7*w/20, 0);
  ctx.lineTo(yCos * -w/2, -5*h/8);
  ctx.fill();
  ctx.stroke();
  
  if (r < 180) {
    drawLeftArm();
  } else {
    drawRightArm();
  }
      
  ctx.restore();
};
