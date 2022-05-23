import Path from "path";
import fs from "fs";
import {benWrite} from "./jsben";
import { isdir, normalizePieceLength, pathPieceLength, fileListTotal, isfile, getsize, bufJoin, pathparts } from "./utils";
import { Buffer } from "buffer";
import { Hasher1, Hasher2, Hasher3 } from "./hasher";

class TorrentFile {
  info: any;
  meta: any;
  name: string;
  path: string;
  piecelength: number;
  outfile: string;
  constructor(
    path: string = "",
    announce: string[] = [],
    httpseed: string[] = [],
    urllist: string[] = [],
    piecelength: number = 0,
    priv: boolean = false,
    comment: string = '',
    source: string = '',
    outfile: string = '',
    cwd: string = '',
  ) {
    this.meta = new Map();
    this.info = new Map();
    this.path = path;
    this.name = Path.basename(Path.resolve(this.path));
    this.meta.set("created by", "torrentfilejs");
    this.info.set("name", this.name);
    if (urllist) this.meta.set("url-list", urllist);
    if (httpseed) this.meta.set("httpseeds", httpseed)
    if (comment) this.info.set("comment", comment);
    if (httpseed) this.meta.set("url-list", httpseed);
    if (source) this.info.set("source", source);
    if (priv) this.info.set("private", 1);
    if (announce && announce.length > 0) {
      this.meta.set("announce", announce[0]);
      this.meta.set("announce-list", [announce]);
    } else {
      this.meta.set("announce", "");
      this.meta.set("announce-list", [[""]]);
    }
    if (piecelength) this.piecelength = normalizePieceLength(piecelength);
    else this.piecelength = pathPieceLength(path);
    this.info.set("piece length", this.piecelength);
    if (!outfile && cwd) this.outfile = "./" + this.name + ".torrent";
    else this.outfile = outfile;
    this.meta.set("info", this.info);
  }

  sortMeta() {
    let info = this.meta.get("info");
    info = new Map([...this.info].sort());
    this.meta.set("info", info);
    let meta = new Map([...this.meta].sort());
    this.meta = meta;
    return meta;
  }

  write() {
    this.sortMeta();
    var path;
    if (this.outfile) path = this.outfile;
    else  path = this.path + ".torrent";
    benWrite(this.meta, path);
  }
}

class Torrent extends TorrentFile {
  constructor(...args: any[]){
    super(...args)
  }

  assemble(){
    let info = this.info;
    let { size, files } = fileListTotal(this.path);
    if (isfile(this.path)) info.set("length", size);
    else {
      info.set("files", []);
      files.forEach((path) => {
        let obj = new Map();
        obj.set("length", getsize(path));
        obj.set("path", pathparts(this.path, path));
        info.get("files").push(obj);
      });
    }
    let pieces = Buffer.alloc(0);
    let feeder = new Hasher1(files, this.info.get("piece length"));
    feeder.iter();
    pieces = bufJoin(feeder.pieces);
    info.set("pieces", pieces);
    this.meta.set("info", info);
    return this.meta;
  }
}

class TorrentV2 extends TorrentFile{
  pieceLayers?: any;
  constructor(...args: any[]){
    super(...args);
    this.pieceLayers = new Map();

  }

  assemble() {
    let info = this.info;
    let { size, files } = fileListTotal(this.path);
    if (isfile(this.path)) {
      info.set("length", size);
      var fileTree = new Map();
      fileTree.set(info.get("name"), this._traverse(this.path));
      info.set("file tree", fileTree);
    } else {
      info.set("file tree", this._traverse(this.path));
    }
    info.set("meta version", 2);
    this.meta.set("piece layers", this.pieceLayers);
    this.info = info;
    this.meta.set("info", this.info);
  }

  _traverse(path: string) {
    if (isfile(path)) {
      let size = getsize(path);
      if (size == 0) {
        return new Map([["", new Map([["length", size]])]]);
      }
      let fhash = new Hasher2(path, this.info.get("piece length"));
      if (size > this.info.get("piece length")) {
        this.pieceLayers.set(fhash.root, fhash.pieceLayer);
      }
      let inner: any = [
        ["length", size],
        ["pieces root", fhash.root],
      ];
      return new Map([["", new Map(inner)]]);
    } else {
      let fileTree = new Map();
      if (isdir(path)) {
        for (let fd of fs.readdirSync(path)) {
          const fpath = Path.resolve(path, fd);
          fileTree.set(fd, this._traverse(fpath));
        }
      }
      return fileTree;
    }
  }
}

class TorrentV3 extends TorrentFile{
  files: any[];
  pieceLayers: any;
  pieces: any;
  hashes: any;
  constructor(...args: any){
    super(...args);
    this.files = [];
    this.pieceLayers = [];
    this.pieces;
    this.hashes;

  }
  assemble() {
    let info = this.info;
    info.set("meta version", 2);
    if (isfile(this.path)) {
      let size = getsize(this.path);
      info.set("length", size);
      var fileTree = new Map();
      fileTree.set(info.get("name"), this._traverse(this.path));
      info.set("file tree", fileTree);
    } else {
      info.set("file tree", this._traverse(this.path));
      info.set("files", this.files);
    }
    this.meta.set("piece layers", this.pieceLayers);
    info.set("pieces", bufJoin(this.pieces));
    this.info = info;
    this.meta.set("info", this.info);
  }

  _traverse(path: string) {
    if (isfile(path)) {
      let size = getsize(path);
      let parts: any[] = [
        ["length", size],
        ["path", pathparts(this.path, path)],
      ];
      this.files.push(new Map(parts));
      if (size == 0) {
        return new Map([["", new Map([["length", size]])]]);
      }
      let fhash = new Hasher3(path, this.info.get("piece length"));
      if (size > this.info.get("piece length")) {
        this.pieceLayers.set(fhash.root, fhash.pieceLayer);
      }
      this.hashes.push(fhash);
      this.pieces.push(bufJoin(fhash.pieces));
      if (fhash.paddingFile) {
        this.files.push(fhash.paddingFile);
      }
      let inner: any[] = [
        ["length", size],
        ["pieces root", fhash.root],
      ];
      return new Map([["", new Map(inner)]]);
    } else {
      let fileTree = new Map();
      if (isdir(path)) {
        for (let fd of fs.readdirSync(path)) {
          const fpath = Path.resolve(path, fd);
          fileTree.set(fd, this._traverse(fpath));
        }
      }
      return fileTree;
    }
  }
}

export { Torrent, TorrentV2, TorrentV3 };
