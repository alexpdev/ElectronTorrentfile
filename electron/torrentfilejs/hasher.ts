import crypto from "crypto";
import fs from "fs";
import {Buffer} from "buffer";
import {bufJoin, nextPow2, getsize} from "./utils";

const BLOCKSIZE = 2 ** 14;
const HASHSIZE = 32;

function merkleRoot(blocks: any): any {
  if (blocks.length > 0) {
    while (blocks.length > 1) {
      let arr = [];
      while (blocks.length > 1) {
        let block1 = blocks.shift();
        let block2 = blocks.shift();
        let block = Buffer.concat(
          [block1, block2],
          block1.length + block2.length
        );
        var shasum = crypto.createHash("sha256");
        shasum.update(block);
        block = shasum.digest();
        arr.push(block);
      }
      blocks = arr;
    }
    return blocks[0];
  }
  return null;
}

class Hasher1 {
  pieceLength: number;
  files: any[];
  total: number;
  index: number;
  current: any;
  pieces: any[];
  constructor(files: string[], pieceLength: number) {
    this.pieceLength = pieceLength;
    this.files = files;
    var sizes = files.map((file) => {
      var stats = fs.statSync(file);
      return stats.size;
    });
    this.total = sizes.reduce((a, b) => a + b, 0);
    this.index = 0;
    this.current = fs.openSync(this.files[this.index], 'r');
    this.pieces = [];
  }

  nextFile() {
    this.index += 1;
    if (this.index < this.files.length) {
      fs.close(this.current);
      this.current = fs.openSync(this.files[this.index], 'r');
      return true;
    }
    return false;
  }

  handlePartial(buffer: any) {
    while (buffer.length < this.pieceLength && this.nextFile()) {
      var target = this.pieceLength - buffer.length;
      var temp = Buffer.alloc(target);
      var size = fs.readSync(this.current, temp, 0, target, -1);
      buffer = Buffer.concat([buffer, temp], buffer.length + size);
      if (size == target) break;
    }
    return buffer;
  }

  hash(buffer: any) {
    var shasum = crypto.createHash("sha1");
    shasum.update(buffer);
    var result = shasum.digest();
    this.pieces.push(result);
  }

  iter() {
    var result = null;
    while (1) {
      var buffer = Buffer.alloc(this.pieceLength);
      var consumed = fs.readSync(
        this.current,
        buffer,
        0,
        this.pieceLength,
        null
      );
      if (!consumed) {
        if (!this.nextFile()) {
          return;
        }
      } else if (consumed < this.pieceLength) {
        buffer = this.handlePartial(buffer.subarray(0, consumed));
        this.hash(buffer);
      } else {
        this.hash(buffer);
      }
    }
  }
}

class Hasher2 {
  pieceLength: number;
  root: any;
  pieceLayer: any;
  num_blocks: number;
  current: any;
  layerHashes: any[];
  constructor(file: string, pieceLength: number) {
    this.pieceLength = pieceLength;
    this.root = null;
    this.pieceLayer = null;
    this.layerHashes = [];
    this.num_blocks = Math.floor(pieceLength / BLOCKSIZE);
    let current = fs.openSync(file, 'r');
    this.processFile(current);
  }

  processFile(fd: number) {
    while (1) {
      let blocks = [];
      let leaf = Buffer.alloc(BLOCKSIZE);
      for (let i = 0; i < this.num_blocks; i++) {
        var consumed = fs.readSync(fd, leaf, 0, BLOCKSIZE, null);
        if (!consumed) break;
        if (consumed < BLOCKSIZE) {
          leaf = leaf.subarray(0, consumed);
        }
        blocks.push(this.hash(leaf));
      }
      if (blocks.length == 0) {
        break;
      }
      if (blocks.length != this.num_blocks) {
        let remainder = this.num_blocks - blocks.length;
        if (this.layerHashes.length == 0) {
          let p2 = nextPow2(blocks.length);
          remainder = p2 - blocks.length;
        }
        for (let j = 0; j < remainder; j++) {
          let padding = Buffer.alloc(32);
          blocks.push(padding);
        }
      }
      let layerHash = merkleRoot(blocks);
      this.layerHashes.push(layerHash);
    }
    this._calcRoot();
  }

  hash(buffer: any) {
    var shasum = crypto.createHash("sha256");
    shasum.update(buffer);
    return shasum.digest();
  }

  _calcRoot() {
    this.pieceLayer = bufJoin(this.layerHashes);
    if (this.layerHashes.length > 1) {
      let p2 = nextPow2(this.layerHashes.length);
      let remainder = p2 - this.layerHashes.length;
      let arr = [];
      for (let i = 0; i < this.num_blocks; i++) {
        let padding = Buffer.alloc(HASHSIZE);
        arr.push(padding);
      }
      let result = merkleRoot(arr);
      for (let j = 0; j < remainder; j++) {
        let buffer = new (Buffer.from(result) as any);
        this.layerHashes.push(buffer);
      }
    }
    this.root = merkleRoot(this.layerHashes);
    console.log(this.root);
  }
}

class Hasher3 {
  pieceLength: number;
  root: any;
  pieceLayer: any;
  paddingPiece: any;
  paddingFile: any;
  total: number;
  pieces: any[];
  num_blocks: number;
  current: any;
  layerHashes: any[];
  constructor(file: string, pieceLength: number) {
    this.pieceLength = pieceLength;
    this.root = null;
    this.pieces = [];
    this.paddingPiece = null;
    this.paddingFile = null;
    this.pieceLayer = null;
    this.layerHashes = [];
    this.total = getsize(file);
    this.num_blocks = Math.floor(pieceLength / BLOCKSIZE);
    let current = fs.openSync(file, 'r');
    this.processFile(current);
  }

  processFile(fd: number) {
    while (1) {
      let blocks = [];
      let plength = this.pieceLength;
      let leaf = Buffer.alloc(BLOCKSIZE);
      let piece = crypto.createHash("sha1");
      for (let i = 0; i < this.num_blocks; i++) {
        var consumed = fs.readSync(fd, leaf, 0, BLOCKSIZE, null);
        this.total -= consumed;
        if (!consumed) break;
        if (consumed < BLOCKSIZE) {
          leaf = leaf.subarray(0, consumed);
        }
        plength -= consumed;
        blocks.push(this.hash(leaf));
        piece.update(leaf);
      }
      if (blocks.length == 0) {
        break;
      }
      if (blocks.length != this.num_blocks) {
        let remainder = this.num_blocks - blocks.length;
        if (this.layerHashes.length == 0) {
          let p2 = nextPow2(blocks.length);
          remainder = p2 - blocks.length;
        }
        for (let j = 0; j < remainder; j++) {
          let padding = Buffer.alloc(HASHSIZE);
          blocks.push(padding);
        }
      }
      let layerHash = merkleRoot(blocks);
      this.layerHashes.push(layerHash);
      if (plength > 0) {
        this.paddingFile = new Map();
        this.paddingFile.set("attr", "p");
        this.paddingFile.set("length", this.total);
        this.paddingFile.set("path", [".pad", plength.toString()]);
        piece.update(Buffer.alloc(plength));
      }
      this.pieces.push(piece.digest());
    }
    this._calcRoot();
  }

  hash(buffer: any) {
    var shasum = crypto.createHash("sha256");
    shasum.update(buffer);
    return shasum.digest();
  }

  _calcRoot() {
    let size = 0;
    for (let hash of this.layerHashes) {
      size += hash.length;
    }
    this.pieceLayer = Buffer.concat(this.layerHashes, size);
    let hashes = this.layerHashes.length;
    if (hashes > 1) {
      let p2 = nextPow2(hashes);
      let remainder = p2 - hashes;
      let arr = [];
      for (let i = 0; i < this.num_blocks; i++) {
        let padding = Buffer.alloc(HASHSIZE);
        arr.push(padding);
      }
      for (let j = 0; j < remainder; j++) {
        this.layerHashes.push(merkleRoot(arr));
      }
    }
    this.root = merkleRoot(this.layerHashes);
  }
}

export { Hasher1, Hasher2, Hasher3 };
