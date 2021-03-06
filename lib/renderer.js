const Promise = require('bluebird');
var emacs = require('./emacs');
const cheerio = require('cheerio');
const { basename, extname, join } = require('path');
const fs = require('hexo-fs');
const { resolve } = require('url');
const {highlight, encodeURL, htmlTag} = require('hexo-util');
const {isMatch, isTmpFile, isHiddenFile, isExcludedFile} = require('./utils');


function render_html(html, context, data, config) {
    return new Promise((reslove, reject) => {

        // for use 'htmlize' to syntax highlight code block
        if (config.org.htmlize)
            reslove(html);

        // for use 'highlight.js' to syntax highlight code block (default)
        config.highlight = config.highlight || {};
        var $ = cheerio.load(html, {
            ignoreWhitespace: false,
            xmlMode: false,
            lowerCaseTags: false,
            decodeEntities: true
        });

        $('pre.src').each(function() {
            var lang = 'unknown';
            var code = $(this);
            var class_str = code.attr('class');
            if (class_str.startsWith('src src-')) {
                lang = class_str.substring('src src-'.length);
            }
	    
	    var locs = code.attr('data-locs')
	    
            var firstLine = parseInt(locs);

            var gutter;
            if (config.org.line_number)
                gutter = true;
            else {
                gutter = (firstLine == 0) ? false : true;
            }

            // USE hexo.utils to render highlight.js code block
            $(this).replaceWith( highlight(code.text(), {
                gutter: gutter,
                autoDetect: config.highlight.auto_detect,
                firstLine: firstLine,
                lang: lang
            }));
        });

	$('img').each(function() {
	    var img =$(this);
	    var src = img.attr('src');
	    var relpath = data.path.substring(context.source_dir.length)
	    const Post = context.model('Post')
	    const post = Post.findOne({source: relpath});
	    const PostAsset = context.model('PostAsset');
	    const asset = PostAsset.findOne({post: post._id, slug: src}) || PostAsset.findOne({post: post._id, slug: basename(src)});
	    if (asset) {
		const attrs = {
		    src: encodeURL(resolve('/', asset.path))
		}
		$(this).replaceWith(htmlTag('img', attrs));
	    }
	});

        reslove($.html());
    });
}

function render(data) {
    var ctx = this;

    function scanAssetDir(post) {
	if (!ctx.config.post_asset_folder) return;

	const assetDir = post.asset_dir;
	const baseDir = ctx.base_dir;
	const baseDirLength = baseDir.length;
	const PostAsset = ctx.model('PostAsset');
	return fs.stat(assetDir).then(stats => {
	    if (!stats.isDirectory()) return [];

	    return fs.listDir(assetDir);
	}).catch(err => {
	    if (err.cause && err.cause.code === 'ENOENT') return [];
	    throw err;
	}).filter(item => !isExcludedFile(item, ctx.config)).map(item => {
	    const id = join(assetDir, item).substring(baseDirLength).replace(/\\/g, '/');
	    const asset = PostAsset.findById(id);
	    if (asset) return undefined;
	    return PostAsset.save({
		_id: id,
		post: post._id,
		slug: item,
		modified: true
	    });
	});
    }

    return emacs.process(ctx, data)
	.then(html => {
	    return new Promise((res, rej) => {
		var relpath = data.path.substring(ctx.source_dir.length)
		const Post = ctx.model('Post')
		const post = Post.findOne({source: relpath});
		if (post) {
		    return scanAssetDir(post).then(x => res(html));
		} else {
		    res(html);
		}
	    });
	}).then((html) => {
	    return render_html(html, ctx, data, ctx.config)
	})
}


module.exports = render;
