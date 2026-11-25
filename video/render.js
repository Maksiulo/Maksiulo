const {chromium}=require('playwright');const {spawn}=require('child_process');
(async()=>{const [a,b,port,out]=process.argv.slice(2);const srv=spawn('python3',['-m','http.server',port],{cwd:__dirname,stdio:'ignore'});await new Promise(r=>setTimeout(r,1000));
const br=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await br.newPage({viewport:{width:1080,height:1920}});p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(`http://localhost:${port}/index.html`);await p.waitForFunction(()=>window.renderAt&&window.ready);await p.evaluate(()=>window.ready);
const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate','30','-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-r','30',out],{stdio:['pipe','inherit','inherit']});
for(let f=+a;f<+b;f++){await p.evaluate(t=>renderAt(t),f/30);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(f%60==0)console.log(out,f)}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();srv.kill()})();
