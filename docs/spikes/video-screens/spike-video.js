// SPIKE (throwaway): video texture on the museum screen. Needs the SPIKE-TEMP globals in viewer.ts.
window.spikeVideo = async ({ offset = 0.015, src = './sample.mp4' } = {}) => {
    const pc = window.__pc;
    const app = window.app;
    const N = [0.6049384091693889, 0.7960102977163639, 0.020423688234863967];
    const corners = [
        [-8.68685531791456, 0.2890500503027504, -0.4849025123716931],
        [-8.643695774475262, 0.27532838401552817, -1.2284644835276568],
        [-8.31626120227035, 0.025670085921443486, -1.1965002776003264],
        [-8.361253567277563, 0.041133627643091475, -0.466540483306945]
    ];
    const P = corners.map(p => p.map((v, i) => v + N[i] * offset));
    window.__spikeCenter = [0, 1, 2].map(i => P.reduce((s, p) => s + p[i], 0) / 4);

    const video = document.createElement('video');
    Object.assign(video, { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous' });
    await video.play();

    const dev = app.graphicsDevice;
    const tex = new pc.Texture(dev, {
        name: 'spike-video',
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: false,
        width: video.videoWidth,
        height: video.videoHeight,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });
    tex.setSource(video);

    const mesh = new pc.Mesh(dev);
    mesh.setPositions(P.flat());
    mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
    mesh.setIndices([0, 3, 2, 0, 2, 1]);
    mesh.update();

    const mat = new pc.StandardMaterial();
    mat.useLighting = false;
    mat.diffuse = new pc.Color(0, 0, 0);
    mat.emissive = new pc.Color(1, 1, 1);
    mat.emissiveMap = tex;
    mat.cull = pc.CULLFACE_NONE;
    mat.update();

    const e = new pc.Entity('spike-video');
    e.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)] });
    app.root.addChild(e);

    const onFrame = () => {
        tex.upload();
        app.renderNextFrame = true;
        video.requestVideoFrameCallback(onFrame);
    };
    video.requestVideoFrameCallback(onFrame);
    window.__spike = { video, tex, e, mat };
    return { w: video.videoWidth, h: video.videoHeight, device: dev.deviceType };
};

// Positional sound for the video: Web Audio panner at the screen, listener follows the camera.
window.spikeAudio = ({ refDistance = 1, rolloffFactor = 1, distanceModel = 'inverse', maxDistance = 50 } = {}) => {
    const app = window.app;
    const { video } = window.__spike;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(video);
    const c = window.__spikeCenter;

    const panner = new PannerNode(ctx, {
        panningModel: 'HRTF',
        distanceModel,
        refDistance,
        rolloffFactor,
        maxDistance,
        positionX: c[0],
        positionY: c[1],
        positionZ: c[2]
    });
    const pre = new AnalyserNode(ctx, { fftSize: 2048 });
    const post = new AnalyserNode(ctx, { fftSize: 2048 });
    source.connect(pre);
    source.connect(panner).connect(post).connect(ctx.destination);

    const camera = app.root.findByName('camera');
    const L = ctx.listener;
    let follow = true;
    const onUpdate = () => {
        if (!follow) return;
        const p = camera.getPosition();
        const f = camera.forward;
        const u = camera.up;
        const t = ctx.currentTime;
        L.positionX.setValueAtTime(p.x, t);
        L.positionY.setValueAtTime(p.y, t);
        L.positionZ.setValueAtTime(p.z, t);
        L.forwardX.setValueAtTime(f.x, t);
        L.forwardY.setValueAtTime(f.y, t);
        L.forwardZ.setValueAtTime(f.z, t);
        L.upX.setValueAtTime(u.x, t);
        L.upY.setValueAtTime(u.y, t);
        L.upZ.setValueAtTime(u.z, t);
    };
    app.on('update', onUpdate);

    // browsers keep audio suspended until a user gesture
    const resume = () => ctx.resume();
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);

    const rms = (an) => {
        const buf = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += v * v;
        return Math.sqrt(s / buf.length);
    };
    // average the post/pre level ratio over a window, so the video's own loudness cancels out
    const measure = async (ms = 1500) => {
        let sumPre = 0, sumPost = 0, n = 0;
        const end = performance.now() + ms;
        while (performance.now() < end) {
            await new Promise(r => setTimeout(r, 50));
            sumPre += rms(pre);
            sumPost += rms(post);
            n++;
        }
        const ratio = sumPre > 0 ? sumPost / sumPre : null;
        return { ratio: ratio && +ratio.toFixed(3), dB: ratio && +(20 * Math.log10(ratio)).toFixed(1), preRms: +(sumPre / n).toFixed(4) };
    };
    const setListener = (p) => {
        follow = false;
        L.positionX.value = p[0];
        L.positionY.value = p[1];
        L.positionZ.value = p[2];
    };
    window.__audio = { ctx, panner, pre, post, measure, setListener, followCamera: () => { follow = true; }, camera };
    return ctx.state;
};

window.spikeFps = async (ms = 3000) => {
    let n = 0;
    const h = () => n++;
    window.app.on('frameend', h);
    await new Promise(r => setTimeout(r, ms));
    window.app.off('frameend', h);
    return +((n * 1000) / ms).toFixed(1);
};
