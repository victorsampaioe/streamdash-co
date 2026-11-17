/** Maps the blue-lit stadium illustration to the banner's chosen hue. */
export function footballBackgroundStyle(accent:string):{rotate:number;saturation:number}{
  const match=/^#([0-9a-f]{6})$/i.exec(accent);
  if(!match)return {rotate:0,saturation:1};
  const hex=match[1];
  const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),delta=mx-mn;
  if(delta<.035)return {rotate:0,saturation:0.1};
  let hue=0;
  if(mx===r)hue=((g-b)/delta)%6;
  else if(mx===g)hue=(b-r)/delta+2;
  else hue=(r-g)/delta+4;
  hue=((hue*60)%360+360)%360;
  // The original stadium lights are roughly blue (214°).
  const rotate=Math.round(((hue-214+540)%360)-180);
  const saturation=delta<.1?0.18:delta<.22?0.55:1.14;
  return {rotate,saturation};
}
