// ponytail: restrained canvas motifs keep geometry printable; new craft styles can add paths here.
export function drawArtwork(design, input, photo, crop={zoom:1,x:.5,y:.5,invert:false}) {
  const canvas=document.createElement('canvas');canvas.width=480;canvas.height=360;
  const c=canvas.getContext('2d',{willReadFrequently:true});
  c.fillStyle='#fff';c.fillRect(0,0,480,360);c.fillStyle='#000';c.strokeStyle='#000';c.lineWidth=6;c.lineJoin='round';c.lineCap='round';
  c.strokeRect(16,16,448,328);
  const line=(points)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();};
  const text=(value,x,y,size,maxWidth)=>{c.font=`bold ${size}px "Microsoft YaHei",sans-serif`;c.textAlign='center';c.fillText(value,x,y,maxWidth);};
  const topSize=Array.from(input.place).length>8?21:26;
  text(input.place,240,53,topSize,395);
  c.lineWidth=3;line([[42,66],[438,66]]);c.lineWidth=6;
  const box=design.layout==='landscape'?{x:72,y:88,w:336,h:159}:{x:119,y:83,w:242,h:170};
  if(photo){
    const pc=document.createElement('canvas');pc.width=Math.round(box.w/3);pc.height=Math.round(box.h/3);
    const p=pc.getContext('2d',{willReadFrequently:true});
    const scale=Math.max(pc.width/photo.width,pc.height/photo.height)*crop.zoom*design.subjectScale;
    const dw=photo.width*scale,dh=photo.height*scale;
    p.fillStyle='white';p.fillRect(0,0,pc.width,pc.height);p.drawImage(photo,(pc.width-dw)*crop.x,(pc.height-dh)*crop.y,dw,dh);
    const pixels=p.getImageData(0,0,pc.width,pc.height),gray=new Float32Array(pc.width*pc.height);
    for(let i=0;i<gray.length;i++)gray[i]=(pixels.data[i*4]*.2126+pixels.data[i*4+1]*.7152+pixels.data[i*4+2]*.0722)/255;
    for(let y=0;y<pc.height;y++)for(let x=0;x<pc.width;x++){
      const i=y*pc.width+x;
      let dark=gray[i]<design.threshold;
      if(design.photoStyle==='contour'){
        const dx=Math.abs(gray[i]-gray[y*pc.width+Math.min(pc.width-1,x+1)]),dy=Math.abs(gray[i]-gray[Math.min(pc.height-1,y+1)*pc.width+x]);
        dark=dx+dy>(1-design.threshold)*.3;
      }
      if(crop.invert)dark=!dark;
      const v=dark?0:255;pixels.data.set([v,v,v,255],i*4);
    }
    p.putImageData(pixels,0,0);c.imageSmoothingEnabled=false;c.drawImage(pc,box.x,box.y,box.w,box.h);c.imageSmoothingEnabled=true;
    c.lineWidth=5;c.strokeRect(box.x-5,box.y-5,box.w+10,box.h+10);
  }else{
    // An arcade with large, joined shapes; every raised feature is backed by the solid base.
    c.fillRect(70,236,340,10);c.fillRect(80,124,10,112);c.fillRect(390,124,10,112);
    for(let x=80;x<390;x+=78){c.beginPath();c.moveTo(x,233);c.lineTo(x,139);c.quadraticCurveTo(x+39,76,x+78,139);c.lineTo(x+78,233);c.stroke();}
    c.fillRect(70,91,340,8);c.fillRect(98,73,284,7);
    c.save();c.translate(240,233);c.scale(design.subjectScale,design.subjectScale);
    for(let i=0;i<design.subjectCount;i++){
      const x=(i-(design.subjectCount-1)/2)*47;
      c.fillStyle='#fff';c.fillRect(x-23,-83,46,84);c.fillStyle='#000';c.beginPath();c.arc(x,-63,13,0,Math.PI*2);c.fill();c.beginPath();c.roundRect(x-16,-44,32,40,12);c.fill();
      line([[x-10,-10],[x-12,0]]);line([[x+10,-10],[x+12,0]]);
    }c.restore();
  }
  c.lineWidth=5;
  for(const x of [43,437]){
    if(design.motif==='heart'){c.beginPath();c.moveTo(x,177);c.bezierCurveTo(x-27,157,x-15,143,x,156);c.bezierCurveTo(x+15,143,x+27,157,x,177);c.fill();}
    else if(design.motif==='star'){c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,r=i%2?8:17;const px=x+Math.cos(a)*r,py=163+Math.sin(a)*r;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fill();}
    else if(design.motif==='waves'){for(let y=148;y<185;y+=13){c.beginPath();c.moveTo(x-13,y);c.quadraticCurveTo(x,y-13,x+13,y);c.stroke();}}
    else{line([[x-9,140],[x+9,157],[x-9,174],[x+9,191]]);}
  }
  const captionSize=Math.min(37,370/Math.max(1,Array.from(design.caption).length));
  text(design.caption,240,296,captionSize,388);
  if(input.date)text(input.date.replaceAll('-',' . '),240,327,15,290);
  return canvas;
}
