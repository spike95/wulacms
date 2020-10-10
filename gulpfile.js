const {
    src,
    dest,
    series,
    parallel,
    watch
} = require('gulp');
const fs = require("fs");
const path = require("path");
const pkg = require('./package.json')
const os = require('os')
const through = require('through2');
const babel = require('gulp-babel')
const less = require('gulp-less')
const lessc = require('less')
const postcss = require('gulp-postcss')
const autoprefix = require('autoprefixer')
const pxtorem = require('postcss-pxtorem')
const connect = require('gulp-connect')
const minimist = require('minimist')
const preprocess = require("gulp-preprocess")
const cleancss = require('gulp-clean-css')
const minifyCSS = require('clean-css');
const clean = require('gulp-rimraf')
const uglify = require('gulp-uglify')
const relogger = require('gulp-remove-logging')
const validate = require('gulp-jsvalidate')
const notify = require('gulp-notify')
const header = require('gulp-header')
// let config={}
let config = []
const pathName=(path,f)=>{
    let path_arr=[...path],reverse=0;
    switch(path_arr[0]){
      case '.':// ./src/mjs
        path_arr[0]=''
        break
      case '/':// /src/mjs
        break
      case '!':// !src/mjs
          path_arr[0]=''
          reverse=1;
        break
      default: // src/mjs
        path_arr.unshift('/')
        break;
    }
    return reverse?'!'+'/modules/'+f+path_arr.join(''):'./modules/'+f+path_arr.join('');
  }

//获取子目录gulpfile.js 
const getGpFiles = cb => {
    let promise_list = [];
    new Promise((resolve, reject) => {
        //遍历当前目录
        fs.readdir(path.join(__dirname,'/modules'), (err, data) => {
            resolve(data);
        })
    }).then(arr => {
        arr.forEach(f => {
            promise_list.push(
                new Promise(resovle => {
                    if (fs.statSync(path.join(__dirname, '/modules/'+f)).isDirectory()) {
                        if (f != 'node_modules' && f != 'system' && f != 'backend') {
                            config.push(f)
                        }

                        if(f=='backend'){
                            backendGulp=require('./modules/'+f+'/gulpfile.js')
                        }
                        resovle();
                    } else {
                        resovle();
                    }
                })
            )
        })
        Promise.all(promise_list).then(() => {
            cb()
        })
    })
}



const knownOptions = {
        string: 'env',
        default: {
            env: process.env.NODE_ENV || 'dev'
        }
    },
    options = minimist(process.argv.slice(2), knownOptions)

const cmt = '/** <%= pkg.name %>-v<%= pkg.version %> <%= pkg.license %> License By <%= pkg.homepage %> */' + os.EOL + ' <%= js %>',
    note = [cmt, {
        pkg: pkg,
        js: ';'
    }],
    noteCss = [cmt, {
        pkg: pkg,
        js: ''
    }];


const compileVue = function () {
    const compile = (stream, file, content, css, next) => {
        let gps = /<template>(.*)<\/template>/ims.test(content),
            tpl = gps ? RegExp.$1 : null;
        let script = /<script[^>]*>(.*)<\/script>/ims.test(content);
        if (tpl && script) {
            content = RegExp.$1.trim().replace('$tpl$', tpl.trim())
        } else if (script) {
            content = RegExp.$1.trim()
        }
        if (css) {
            let minCss = new minifyCSS({
                compatibility: '*'
            }).minify(css.css).styles;

            let styleId = css.styleID;
            content = `layui.injectCss('cmp-${styleId}',\`${minCss}\`);` + content;
        }

        file.contents = Buffer.from(content);
        stream.push(file);
        next();
    };
    return through.obj(function (file, enc, cbx) {
        let content = file.contents.toString();

        let les = /<style\s+id\s*=\s*"([^"]+)"[^>]*>(.*)<\/style>/ims.test(content),
            css = les ? RegExp.$2.trim() : null;
        if (css) {
            let styleID = RegExp.$1.trim();
            lessc.render(css, {
                async: false,
                fileAsync: false
            }).then((val) => {
                val.styleID = styleID;
                compile(this, file, content, val, cbx)
            }).catch((err) => {
                compile(this, file, content, false, cbx);
            });
        } else {
            compile(this, file, content, false, cbx)
        }
    });
};
const cleanTask = cb => {
    src([pathName('js/*'), pathName('css/*')], {
        read: true,
        allowEmpty: true
    }).pipe(clean())

    cb()
}
const buildVue = (cb,f) => {
    let gp = src([pathName('/src/widget/*.vue',f)]);
    gp = gp.pipe(compileVue()).pipe(babel({
        "presets": [
            [
                "@babel/preset-env",
                {
                    "loose": true,
                    "modules": false,
                    "forceAllTransforms": true
                }
            ]
        ],
        "plugins": ["@babel/plugin-proposal-class-properties"]
    })).on('error', (e) => {
        console.error(e.message);
        notify.onError(e.message)
    }).pipe(validate()).on('error', (e) => {
        notify.onError(e.message);
        console.error(e.message)
    });

    if (options.env == 'pro')
        gp = gp.pipe(relogger({
            replaceWith: 'void 0'
        })).pipe(uglify()).on('error', (e) => {
            notify.onError(e.message)
            console.error(['widget', e.message])
        }).pipe(header.apply(null, note))

    gp = gp.pipe(dest(pathName('/js',f)));
    cb();
}
const watching = (cb,f) => {
    options.env = "dev"
    options.watch = false
    watch([pathName('/src/widget/*.vue',f)],  (cb)=>{
        buildVue(cb,f)
    })
    cb()
}
exports.default = series(cb=>{
    options.env = 'pro'
    getGpFiles(cb);
}, cb=>{
    config.forEach(f=>{
        buildVue(cb,f)
    })
    backendGulp.init(cb);
    backendGulp.default();
    cb();
});
exports.watch = series(getGpFiles, cb=>{
    config.forEach(f=>{
        watching(cb,f)
    })
    backendGulp.init(cb);
    backendGulp.watch();
    cb();
})