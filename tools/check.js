#!/usr/bin/env node
/*
 * WebSquare 화면 XML 검사: XML 파싱 + CDATA 스크립트 문법(ES5) 검사
 * 사용: node tools/check.js <파일 또는 폴더> [...]
 */
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

function collect(p, out) {
  var st = fs.statSync(p);
  if (st.isDirectory()) fs.readdirSync(p).forEach(function (n) { collect(path.join(p, n), out); });
  else if (/\.xml$/i.test(p)) out.push(p);
  return out;
}

function checkXml(file) {
  try {
    cp.execFileSync('xmllint', ['--noout', file], { stdio: 'pipe' });
    return null;
  } catch (e) {
    if (e.code === 'ENOENT') {
      try {
        cp.execFileSync('python3', ['-I', '-c', 'import sys,xml.etree.ElementTree as E;E.parse(sys.argv[1])', file], { stdio: 'pipe' });
        return null;
      } catch (e2) { return String(e2.stderr || e2.message); }
    }
    return String(e.stderr || e.message);
  }
}

var ES6 = [
  { re: /=>/, msg: '화살표 함수' },
  { re: /\b(let|const)\s/, msg: 'let/const' },
  { re: /`/, msg: '템플릿 문자열' },
  { re: /\bclass\s+\w+/, msg: 'class 선언' }
];

function checkScript(file) {
  var src = fs.readFileSync(file, 'utf8');
  var re = /<script[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/script>/g;
  var m, errs = [], n = 0;
  while ((m = re.exec(src))) {
    n++;
    var code = m[1];
    var tmp = path.join(os.tmpdir(), 'wscheck_' + process.pid + '_' + n + '.js');
    fs.writeFileSync(tmp, code, 'utf8');
    try {
      cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    } catch (e) {
      errs.push('스크립트 문법 오류\n' + String(e.stderr || e.message).replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'script#' + n));
    }
    fs.unlinkSync(tmp);
    var stripped = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
    ES6.forEach(function (r) { if (r.re.test(stripped)) errs.push('ES5 위반: ' + r.msg); });
  }
  return errs;
}

var args = process.argv.slice(2);
if (!args.length) {
  console.error('사용: node tools/check.js <파일 또는 폴더> [...]');
  process.exit(1);
}
var files = [];
args.forEach(function (a) { collect(a, files); });
var fail = 0;
files.forEach(function (f) {
  var errs = [];
  var x = checkXml(f);
  if (x) errs.push('XML 파싱 오류\n' + x);
  errs = errs.concat(checkScript(f));
  if (errs.length) {
    fail++;
    console.log('✗ ' + f);
    errs.forEach(function (e) { console.log('   ' + e.split('\n').join('\n   ')); });
  } else {
    console.log('✓ ' + f);
  }
});
console.log('\n' + files.length + '개 중 ' + (files.length - fail) + '개 통과');
process.exit(fail ? 1 : 0);
