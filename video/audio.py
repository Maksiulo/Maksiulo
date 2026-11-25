import numpy as np, scipy.signal as sg, scipy.io.wavfile as wf
SR=48000; DUR=54.0; N=int(SR*DUR)
rng=np.random.default_rng(1)
def T(d): return np.arange(int(SR*d))/SR
def env(n,a=.005,r=.1):
    t=np.arange(n)/SR; e=np.minimum(1,t/max(a,1e-4))*np.exp(-t/max(r,1e-4)); return e
def add(buf,x,t,g=1.0,pan=0.0):
    i=int(t*SR); 
    if i>=len(buf) or i<0: return
    x=x[:len(buf)-i]
    l=np.cos((pan+1)*np.pi/4); r=np.sin((pan+1)*np.pi/4)
    if x.ndim==1: buf[i:i+len(x),0]+=x*g*l*1.414; buf[i:i+len(x),1]+=x*g*r*1.414
    else: buf[i:i+len(x)]+=x*g
def bp(x,lo,hi,o=2): b,a=sg.butter(o,[lo/(SR/2),hi/(SR/2)],'band'); return sg.lfilter(b,a,x)
def lp(x,f,o=2): b,a=sg.butter(o,f/(SR/2),'low'); return sg.lfilter(b,a,x)
def hp(x,f,o=2): b,a=sg.butter(o,f/(SR/2),'high'); return sg.lfilter(b,a,x)
noise=lambda d: rng.standard_normal(int(SR*d))

# ---------------- MUSIC ----------------
mus=np.zeros((N,2))
BPM=100; beat=60/BPM; bar=4*beat
roots=[57,53,48,55]  # A F C G
chords=[[57,60,64],[53,57,60],[48,52,55],[55,59,62]]
f=lambda m:440*2**((m-69)/12)
def kick():
    t=T(.45); fr=45+120*np.exp(-t*30); ph=2*np.pi*np.cumsum(fr)/SR; return np.sin(ph)*np.exp(-t*7)*1.0
def snare():
    t=T(.3); return (bp(noise(.3),900,6000)*np.exp(-t*14)*.6+np.sin(2*np.pi*190*t)*np.exp(-t*25)*.4)
def hat(o=False):
    d=.25 if o else .05; t=T(d); return hp(noise(d),7000)*np.exp(-t*(10 if o else 70))*.35
def b808(m,d):
    t=T(d); x=np.sin(2*np.pi*f(m-24)*t+.6*np.sin(2*np.pi*f(m-24)*t)); return np.tanh(2*x)*np.minimum(1,t/.01)*np.exp(-t*1.2)*.55
def pad(ms,d):
    t=T(d); x=sum(sg.sawtooth(2*np.pi*f(m)*t*(1+dt))for m in ms for dt in(-.004,.004)); x=lp(x,1400)
    e=np.minimum(1,t/.4)*np.minimum(1,(d-t)/.4); return x*e*.06
def pluck(m,d=.35):
    t=T(d); x=sg.square(2*np.pi*f(m)*t,.3)*np.exp(-t*9); return lp(x,3500)*.13
def active(t):  # music state
    if 38.45<=t<41.8: return 0
    return 1
nb=int(DUR/beat)+1
for b in range(nb):
    t0=b*beat; 
    if t0>=DUR-.3: break
    ci=(b//4)%4; full=t0>=5.15; fin=t0>=44.5
    if not active(t0) : continue
    if 38.45-beat<t0<38.45: pass
    if b%4==0:
        add(mus,pad(chords[ci],bar),t0,1.0 if full else .8)
    if full:
        if b%2==0: add(mus,kick(),t0,.9)
        if b%4==3: add(mus,kick(),t0+beat*.5,.6)
        if b%2==1: add(mus,snare(),t0,.55)
        for k in range(4 if fin else 2): add(mus,hat(),t0+k*beat/(4 if fin else 2),.5,pan=.3)
        if b%4==0: add(mus,b808(roots[ci],bar*.9),t0,.9)
    else:
        for k in range(2): add(mus,hat(),t0+k*beat/2,.25,pan=.3)
    # pluck arpeggio
    arp=[0,1,2,1]
    for k in range(2):
        m=chords[ci][arp[(b*2+k)%4]]+12+(12 if fin else 0)
        add(mus,pluck(m),t0+k*beat/2,.8 if full else .6,pan=-.3 if k else .3)
# riser before drop at 5.2 and finale
r=T(1.2); add(mus,hp(noise(1.2),2000)*(r/1.2)**2*.25,4.0)
add(mus,hp(noise(1.2),2000)*(r/1.2)**2*.25,43.3)
# wasted: slowed down tape stop on music at 38.45
i0=int(38.45*SR); seg=mus[i0-int(1.2*SR):i0].copy()
# simple tape stop: resample progressively slower
L=int(1.0*SR); idx=np.cumsum(np.linspace(1,0.05,L)); idx=idx[idx<len(seg)-1].astype(int)
mus[i0:i0+len(idx)]+=seg[idx]*np.linspace(1,0,len(idx))[:,None]*.8
# fade end
fe=int(52*SR); mus[fe:]*=np.linspace(1,0,N-fe)[:,None]
mus*=0.5

# ---------------- SFX ----------------
fx=np.zeros((N,2))
def whoosh(d=.5,up=True):
    t=T(d); x=noise(d); fc=np.linspace(400,4000,len(t)) if up else np.linspace(3000,300,len(t))
    y=np.zeros_like(x); # time-varying lowpass via blocks
    blk=512
    for i in range(0,len(x),blk):
        y[i:i+blk]=bp(x[max(0,i-2048):i+blk],fc[i]*.5,min(fc[i]*1.6,20000))[-len(x[i:i+blk]):]
    e=np.sin(np.pi*np.linspace(0,1,len(t)))**2; return y*e*.6
def pop():
    t=T(.12); fr=900*np.exp(-t*25)+300; return np.sin(2*np.pi*np.cumsum(fr)/SR)*np.exp(-t*30)*.5
def click():
    t=T(.04); return (np.sin(2*np.pi*2400*t)*.5+hp(noise(.04),3000)*.3)*np.exp(-t*120)
def blip(fq=1200):
    t=T(.06); return sg.square(2*np.pi*fq*t)*np.exp(-t*60)*.12
def coin(p=0):
    t=T(.35); a=sg.square(2*np.pi*988*2**(p/12)*t,.5)*(t<.07)+sg.square(2*np.pi*1319*2**(p/12)*t,.5)*(t>=.07)
    return lp(a,6000)*np.exp(-t*7)*.13
def kaching():
    t=T(.9); x=sum(np.sin(2*np.pi*fr*t)*np.exp(-t*k) for fr,k in[(2093,4),(2637,5),(3136,6),(4186,7)])*.15
    return x+hp(noise(.9),5000)*np.exp(-t*12)*.2
def thud(fr=80,d=.4):
    t=T(d); return (np.sin(2*np.pi*fr*t*np.exp(-t*3))*np.exp(-t*12)+lp(noise(d),600)*np.exp(-t*25)*.6)*.8
def clang():
    t=T(1.2); x=sum(np.sin(2*np.pi*fr*t)*np.exp(-t*k) for fr,k in[(523,3),(1180,4),(1730,5),(2760,7),(3900,9)])*.25
    return x+thud(60,.5).tolist().__len__()*0+np.pad(thud(60,.5),(0,len(t)-int(.5*SR)))
def step(h=1.0):
    t=T(.08); return bp(noise(.08),150,1500)*np.exp(-t*60)*.35*h
def shutter():
    t=T(.25); x=hp(noise(.25),2000)*(np.exp(-t*80)+np.exp(-np.maximum(t-.09,0)*80)*(t>.09))*.6; return x
def bark():
    t=T(.22); fr=np.interp(t,[0,.05,.22],[350,620,260]); x=sg.sawtooth(2*np.pi*np.cumsum(fr)/SR)
    x=bp(x,400,2200)+bp(noise(.22),500,1800)*.4; e=np.minimum(1,t/.01)*np.exp(-t*12); return x*e*.6
def boom():
    t=T(2.5); return (np.sin(2*np.pi*45*t*np.exp(-t*.5))*np.exp(-t*1.5)+lp(noise(2.5),300)*np.exp(-t*3)*.6)*.9
def rewind(d=1.8):
    t=T(d); fr=600+500*np.sin(2*np.pi*7*t)+t*900; x=sg.sawtooth(2*np.pi*np.cumsum(fr)/SR)*.2+bp(noise(d),1500,6000)*.3
    return lp(x,5000)*np.minimum(1,t/.1)*np.minimum(1,(d-t)/.1)*.5
def fanfare():
    out=np.zeros(int(SR*1.6))
    for i,(m,tt) in enumerate([(72,0),(76,.12),(79,.24),(84,.36)]):
        t=T(1.2-tt); x=(sg.square(2*np.pi*f(m)*t,.4)*.5+sg.sawtooth(2*np.pi*f(m)*t*1.003)*.3)*np.exp(-t*(2.5 if i==3 else 8))
        s=int(tt*SR); out[s:s+len(x)]+=lp(x,5000)*.25
    return out
def popper():
    t=T(.5); return hp(noise(.5),1500)*np.exp(-t*10)*.7+thud(120,.2).tolist().__len__()*0
def levelup():
    out=np.zeros(int(SR*.5))
    for i,m in enumerate([76,79,84]):
        t=T(.2); s=int(i*.07*SR); out[s:s+len(t)]+=sg.square(2*np.pi*f(m)*t,.5)*np.exp(-t*15)*.15
    return out

for t in [5.2,10.9,16.3,21.15,25.2,25.95,31.15]: add(fx,whoosh(.55),t-.1,.9)
add(fx,whoosh(1.4,False),0.0,.8); add(fx,whoosh(1.0),44.2,.9)
for t in [1.2,2.75,6.0,7.3,9.2,11.0,12.8,16.4,25.2,27.0,14.0,16.95,32.1,49.4,50.0]: add(fx,pop(),t,.8,pan=rng.uniform(-.3,.3))
for t in [19.9,36.6,41.75]: add(fx,blip(900),t,1)
for t in [20.05,36.8,41.9,42.12]: add(fx,blip(1500),t,1)
for t in [20.55,37.1,42.3]: add(fx,click(),t,1.2)
for a,b in [(17.1,20.0),(32.3,36.5)]:
    for t in np.arange(a,b,.07): add(fx,blip(1800+rng.uniform(-200,200)),t,.25)
for t0 in [15.3,21.1,41.8]:
    add(fx,kaching(),t0,.8)
    for j in range(10): add(fx,coin(j%5),t0+.1+j*.05,.7,pan=rng.uniform(-.5,.5))
for k in range(32): add(fx,coin((k%8)),26.6+k*(4.4/32),.6,pan=rng.uniform(-.4,.4))
for t in [27.2,28.0,28.8,29.6,30.2]: add(fx,levelup(),t,.8)
add(fx,shutter(),13.85,1); add(fx,thud(110,.35),12.95,.8)
for a,b,dt,h in [(10.9,12.4,.42,.6),(12.75,13.9,.42,.5),(12.7,13.5,.36,1),(16.2,17.3,.33,1),(31.4,32.5,.33,1),(21.2,25.2,.12,.8),(25.9,30.7,.1,.7),(42.7,44.3,.36,.6),(38.6,40.0,.3,.6)]:
    for t in np.arange(a,b,dt): add(fx,step(h),t,1,pan=rng.uniform(-.2,.2))
for t in [20.9,21.35,22.0,22.3,24.0,24.9]: add(fx,bark(),t,.9,pan=.2)
add(fx,clang(),23.15,.9); add(fx,thud(70,.5),23.2,1)
add(fx,boom(),38.45,1); add(fx,rewind(),40.0,.9); add(fx,levelup(),41.8,1)
add(fx,fanfare(),44.6,1); add(fx,popper(),45.05,.8)
for j in range(12): add(fx,popper()*.3,45.1+j*.08,.4,pan=rng.uniform(-.7,.7))
# ambience: street wind & distant sea
amb=lp(rng.standard_normal(N),500)*.04; sea=lp(rng.standard_normal(N),900)*(0.5+0.5*np.sin(2*np.pi*np.arange(N)/SR/5))*.06
fade=np.clip((np.arange(N)/SR-43)/3,0,1)
fx[:,0]+=amb+sea*fade; fx[:,1]+=np.roll(amb,999)+np.roll(sea,1777)*fade
# ---------------- VO ----------------
vo=np.zeros((N,2))
VO=[('n01',.35),('n02',2.8),('n03',5.4),('n04',11.0),('j01',17.1),('n05',20.65),('n06',22.4),('n07',25.3),('s01',32.3),('n08',37.25),('n09',38.6),('n10',42.3),('n11',45.0),('n12',49.5)]
for n,t in VO:
    sr,x=wf.read(f'vo/trim/{n}.wav'); x=x.astype(np.float32)/32768
    if x.ndim>1: x=x.mean(1)
    add(vo,x,t,1.0)
for name,b in [('music',mus),('sfx',fx),('vo',vo)]:
    b=b/ max(1e-9,np.abs(b).max())*.9 if name!='sfx' else b/max(1e-9,np.abs(b).max())*.9
    wf.write(f'out/{name}.wav',SR,(b*32767).astype(np.int16))
print('ok')
