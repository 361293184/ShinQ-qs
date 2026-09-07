import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { FishingCatch, FishingWeather } from '../../utils/vrWorld/fishingMarket';
import { speciesById } from '../../utils/vrWorld/fishingMarket';
import { createFishingGame, fishingArcWidth, stepFishingGame, type FishingPhase } from '../../utils/vrWorld/fishingGame';

export const FishingGame: React.FC<{
    weather: FishingWeather; onCast: () => FishingCatch; onCaught: (caught: FishingCatch) => Promise<void>;
}> = ({ weather, onCast, onCaught }) => {
    const canvas = useRef<HTMLCanvasElement>(null);
    const frame = useRef(createFishingGame());
    const pending = useRef<FishingCatch | null>(null);
    const callback = useRef(onCaught); callback.current = onCaught;
    const notified = useRef(false);
    const manualClock = useRef(false);
    const [phase, setPhase] = useState<FishingPhase>('idle');
    const [assist, setAssist] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const deliver = useCallback(async () => {
        if (!pending.current || notified.current) return;
        notified.current = true; setSaving(true); setError('');
        try { await callback.current(pending.current); }
        catch (e) { setError(e instanceof Error ? e.message : '存档失败，请重试收鱼'); }
        finally { setSaving(false); }
    }, []);
    const draw = useCallback(() => {
        const c = canvas.current; const ctx = c?.getContext('2d'); if (!c || !ctx) return;
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        const s = frame.current; const w = 400; const h = 300; const cx = 200; const cy = 133; const r = 88;
        ctx.clearRect(0, 0, w, h);
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, weather.kind === 'storm' ? '#3c5365' : '#3f6b78'); bg.addColorStop(.6, '#214353'); bg.addColorStop(1, '#193440');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 11; i++) {
            ctx.strokeStyle = 'rgba(204,231,226,.09)'; ctx.beginPath();
            for (let x = 0; x <= w; x += 8) { const y = 18 + i * 25 + Math.sin(x * .022 + i + s.elapsed * .45) * 4; x === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y); }
            ctx.stroke();
        }
        if (['rain', 'storm', 'snow'].includes(weather.kind)) {
            ctx.strokeStyle = '#d8eeeb25';
            for (let i = 0; i < 17; i++) { const x = (i * 91 + 19) % w; const y = (i * 67 + s.elapsed * 30) % h; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x - 2, y + (weather.kind === 'snow' ? 2 : 8)); ctx.stroke(); }
        }
        ctx.save(); ctx.translate(cx, cy);
        for (let radius = 29; radius <= r; radius += 29) { ctx.strokeStyle = '#d8eee92d'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2);ctx.stroke(); }
        ctx.setLineDash([2,6]);ctx.strokeStyle = '#d8eee942';ctx.beginPath();ctx.arc(0,0,r+12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
        if (s.phase === 'waiting') {
            ctx.strokeStyle='#cfefdf';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,14+s.elapsed*50,0,Math.PI*2);ctx.stroke();
        } else if (s.phase !== 'idle') {
            ctx.strokeStyle = s.phase === 'caught' ? '#f5d79e' : '#afead5'; ctx.lineWidth = 12; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(0,0,r,s.playerAngle-fishingArcWidth(s),s.playerAngle+fishingArcWidth(s));ctx.stroke();
            const x=Math.cos(s.fishAngle)*r;const y=Math.sin(s.fishAngle)*r;
            ctx.save();ctx.translate(x,y);ctx.rotate(s.fishAngle+Math.PI/2);ctx.fillStyle='#fff6de';
            ctx.beginPath();ctx.ellipse(0,0,10,4.5,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-7,0);ctx.lineTo(-14,-6);ctx.lineTo(-14,6);ctx.closePath();ctx.fill();ctx.restore();
            ctx.strokeStyle='#e9d6ad';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,36,-Math.PI/2,-Math.PI/2+s.progress*Math.PI*2);ctx.stroke();
            ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#eef7f4';ctx.font='500 22px Georgia,serif';ctx.fillText(Math.round(s.progress*100)+'%',0,0);
        } else {
            ctx.textAlign='center';ctx.fillStyle='#e5f3e9';ctx.font='22px Georgia,serif';ctx.fillText('潮汐共振',0,4);
            ctx.fillStyle='#cbe3da99';ctx.font='9px sans-serif';ctx.fillText('T I D E   R E S O N A N C E',0,26);
        }
        ctx.restore();ctx.textAlign='center';ctx.fillStyle='#e4eee3';ctx.font='12px sans-serif';
        ctx.fillText(s.phase==='idle'?'向水下抛出一根共振线':s.phase==='waiting'?'有东西靠近了……':s.phase==='caught'?'收线，有收获！':s.phase==='escaped'?'鱼影游远了，再试一次吧':'让鱼影停在绿色光弧里',200,262);
        ctx.fillStyle='#cee4dd99';ctx.font='10px sans-serif';ctx.fillText(s.phase==='hooked'?'按住顺时针 · 松开逆时针':weather.label+'水域',200,283);
    }, [weather.kind, weather.label]);
    const advance = useCallback((ms: number) => {
        let remaining = Math.max(0, Math.min(ms, 60_000));
        while (remaining > 0) { const n = Math.min(1000/120, remaining); stepFishingGame(frame.current, n/1000); remaining-=n; }
        setPhase(frame.current.phase);
        if (frame.current.phase === 'caught') void deliver();
        draw();
    }, [deliver, draw]);
    useEffect(() => {
        let raf=0; let last=0;
        const tick = (now:number) => {
            if (!manualClock.current && document.visibilityState !== 'hidden') advance(last ? Math.min(50,now-last) : 0);
            last=now; raf=requestAnimationFrame(tick);
        };
        raf=requestAnimationFrame(tick);
        return()=>cancelAnimationFrame(raf);
    },[advance]);
    useEffect(() => {
        const release=()=>{frame.current.held=false;};
        const down=(event:KeyboardEvent)=>{
            if ((event.target as HTMLElement)?.closest('input,textarea,select,button')) return;
            if(event.code==='Space'){event.preventDefault();frame.current.held=true;}
            if(event.key.toLowerCase()==='f'){
                const promise = document.fullscreenElement ? document.exitFullscreen?.() : canvas.current?.closest('.fishing-shell')?.requestFullscreen?.();
                void promise?.catch(()=>{});
            }
        };
        const up=(event:KeyboardEvent)=>{if(event.code==='Space')release();};
        window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',release);document.addEventListener('visibilitychange',release);
        return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',release);};
    },[]);
    useEffect(()=>{
        const target=window as Window & {render_game_to_text?:()=>string;advanceTime?:(ms:number)=>void};
        const render=()=>JSON.stringify({mode:'tide-resonance-fishing',coordinates:'angles: radians; zero right; positive clockwise',...frame.current,arcHalfWidth:fishingArcWidth(frame.current),weather:weather.kind,weatherSource:weather.source});
        const step=(ms:number)=>{manualClock.current=true;advance(ms);};
        target.render_game_to_text=render;target.advanceTime=step;
        return()=>{if(target.render_game_to_text===render)delete target.render_game_to_text;if(target.advanceTime===step)delete target.advanceTime;};
    },[advance,weather]);
    const cast=()=>{
        pending.current=onCast();notified.current=false;setError('');
        frame.current={...createFishingGame(speciesById(pending.current.speciesId)?.difficulty,assist),phase:'waiting'};
        setPhase('waiting');canvas.current?.focus();draw();
    };
    const active=phase==='waiting'||phase==='hooked';
    return <div>
        <canvas ref={canvas} width={800} height={600} tabIndex={0} aria-label="潮汐共振钓鱼，按住空格或水面控制光弧"
            style={{width:'100%',aspectRatio:'4 / 3',touchAction:'none',borderRadius:12,display:'block'}}
            onPointerDown={e=>{e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);frame.current.held=true;}}
            onPointerUp={()=>{frame.current.held=false;}} onPointerCancel={()=>{frame.current.held=false;}} />
        <div className="mt-3 flex items-center gap-3"><button className="fish-action primary flex-1" disabled={saving||active||!!error} onClick={cast}>{saving?'收进水箱…':active?'正在钓鱼':phase==='idle'?'抛竿':'再钓一次'}</button>
            {active?<button className="fish-action" onClick={()=>{frame.current.phase='escaped';frame.current.held=false;setPhase('escaped');draw();}}>收竿</button>:<label className="fish-note flex items-center gap-1.5"><input type="checkbox" checked={assist} onChange={e=>setAssist(e.target.checked)}/>轻松模式</label>}</div>
        {error&&<div className="mt-2 text-[11px] text-amber-200">{error}<button className="fish-action ml-2" disabled={saving} onClick={()=>{notified.current=false;void deliver();}}>重试收鱼</button></div>}
        <p className="fish-note mt-3">按住水面或 Space，光弧顺时针移动；松开则逆时针。追住鱼影，让共振充满。F 切换全屏。</p>
    </div>;
};
