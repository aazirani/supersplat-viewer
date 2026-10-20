import { Asset, Entity } from 'playcanvas';
import type { AppBase } from 'playcanvas';

// Where a gsplat comes from: the first scene's config, or a room's content url.
type GsplatSource = {
    contentUrl: string;
    contentFilename?: string | null;
    contents?: Promise<Response>;
};

// The filename's extension selects the gsplat parser, so a url with no usable name (a data:
// uri) needs the config to name its content instead; falsy (an empty name) falls back to the
// url-derived name.
const contentName = (contentUrl: string, contentFilename?: string | null) =>
    contentFilename || new URL(contentUrl, location.href).pathname.split('/').pop();

const loadGsplat = async (
    app: AppBase,
    source: GsplatSource,
    progressCallback: (progress: number) => void,
    cancelled: () => boolean
): Promise<{ entity: Entity; asset: Asset }> => {
    const { contents, contentUrl, contentFilename } = source;
    const c = contents as unknown as ArrayBuffer;
    const filename = contentName(contentUrl, contentFilename);
    let data: object | undefined;
    if (filename.toLowerCase() === 'meta.json') {
        // a room's source has no prefetched response, so its metadata is fetched here
        const response = await (contents ?? fetch(contentUrl));
        if (!response.ok) {
            throw new Error(`loadGsplat: "${contentUrl}": ${response.status} ${response.statusText}`);
        }
        data = await response.json();
    }

    // Reading that metadata spans a network round trip, so a destroy can land in the middle of
    // it. `app.destroy()` nulls the asset registry, so registering the asset now would throw
    // from the engine's internals; reject instead, which the viewer's load chains expect.
    if (cancelled()) {
        throw new Error('loadGsplat: the viewer was destroyed while loading');
    }

    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);

    return new Promise<{ entity: Entity; asset: Asset }>((resolve, reject) => {
        asset.on('load', () => {
            // always name the app: the engine's default is the most recently created one,
            // which is another viewer's when two share a page
            const entity = new Entity('gsplat', app);
            entity.setLocalEulerAngles(0, 0, 180);
            entity.addComponent('gsplat', {
                unified: true,
                asset
            });
            app.root.addChild(entity);
            resolve({ entity, asset });
        });

        let watermark = 0;
        asset.on('progress', (received, length) => {
            // no longer wanted (a replaced room preload): stop the download and free what came
            if (cancelled()) {
                app.assets.remove(asset);
                asset.unload();
                reject(new Error(`loadGsplat: "${contentUrl}" was cancelled while loading`));
                return;
            }
            const progress = Math.min(1, received / length) * 100;
            if (progress > watermark) {
                watermark = progress;
                progressCallback(Math.trunc(watermark));
            }
        });

        asset.on('error', (err) => {
            console.log(err);
            reject(err);
        });

        app.assets.add(asset);
        app.assets.load(asset);
    });
};

export { contentName, loadGsplat };
export type { GsplatSource };
