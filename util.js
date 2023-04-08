const path = require('path');
const os = require('os');
const fs = require('fs');
const { WritableStream } = require('node:stream/web');
const { randomUUID } = require('crypto');

const puppeteer = require('puppeteer');

const initializePageInstance = async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    return async (operation) => {
        try {
            return await operation(page);
        } finally {
            await browser.close();
        }
    };
};

const getInstagramPageUrl = (id) => {
    return `https://instagram.com/${id}`;
};

const loadFullPage = async (id) => {
    const url = getInstagramPageUrl(id);
    const operate = await initializePageInstance();

    return await operate(async (page) => {
        await page.goto(url);
        await page.waitForSelector('.xsms3ob.xsms3ob');
        await page.click('.xsms3ob.xsms3ob');

        // TODO: Scroll
        return await page.evaluate(() => {
            const postLinkRegex = /\/p\/(.*)\//;
            const allPosts = Array.from(document.getElementsByTagName('a'));
            const hrefs = allPosts.flatMap(({ href }) => (
                href.match(postLinkRegex) ? [href] : []
            ));

            return hrefs;
        });
    });
};

const getImageSrcFromUrl = async (postUrl) => {
    const operate = await initializePageInstance();

    return await operate(async (page) => {
        await page.goto(postUrl);
        await page.waitForSelector('.x5yr21d.xu96u03.x10l6tqk.x13vifvy.x87ps6o.xh8yej3');

        return await page.evaluate(() => {
            const allImages = Array.from(document.getElementsByTagName('img'));
            const parseSrcset = (srcset) => {
                const allMatches = srcset.matchAll(/([^,]*)\s([0-9]+)[wx]/g);
                let largest = { size: 0 };

                for (let [, src, sizeString] of allMatches) {
                    const size = Number(sizeString);

                    if (size > largest.size) {
                        largest.size = size;
                        largest.src = src;
                    }
                }

                return largest.src;
            };
            const imageSrcs = allImages.flatMap(({ srcset }) => (
                srcset ? [{ type: 'jpg', src: parseSrcset(srcset) }] : []
            ));

            const allVideos = Array.from(document.getElementsByTagName('video'));
            const videoSrcs = allVideos.flatMap(({ src }) => (
                src ? [{ type: 'mp4', src }] : []
            ));

            return [...videoSrcs, ...imageSrcs];
        });
    });
};

const writeToDesktop = async (id) => {
    const dir = path.join(os.homedir(), 'Desktop', id);

    fs.mkdirSync(dir, { recursive: true });

    const postUrls = await loadFullPage(id);

    for (let postUrl of postUrls) {
        const srcs = await getImageSrcFromUrl(postUrl);

        for (let { src, type } of srcs) {
            const fetched = await fetch(src);
            const writableStream = fs.createWriteStream(path.join(dir, `${randomUUID()}.${type}`));

            await fetched.body.pipeTo(new WritableStream({
                write(chunk) {
                    writableStream.write(chunk);
                }
            }));
        }
    }
};

module.exports = {
    getInstagramPageUrl,
    getImageSrcFromUrl,
    initializePageInstance,
    loadFullPage,
    writeToDesktop,
};
