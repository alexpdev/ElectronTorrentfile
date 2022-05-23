#!/usr/bin/env node
const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { Torrent, TorrentV2, TorrentV3 } = require("./torrent");


function execute() {
  var args = yargs(hideBin(process.argv))
    .describe("a", "one or more tracker/announce URLs")
    .describe("priv", "turns off dht and multi-tracker protocols")
    .describe("source", "used primarily for cross-seeding purposes")
    .describe("comment", "a comment that will be added to the metadata")
    .describe("metaversion", "which bittorrent version to use for formatting")
    .describe(
      "piecelength",
      "fixed size chunck of data for transferring pieces"
    )
    .describe("p", "absolute or relative path to contents.")
    .describe("o", "output save location for created torrent file.")
    .describe("webseed", "one or more Web Seed URLs (GetRight)")
    .describe("httpseed", "one or more Web Seed URLs (Hoffman)")
    .describe("cwd", "use the current directory as output path")
    .alias("o", "out")
    .alias("a", ["tracker", "announce", "t"])
    .alias("piecelength", "pl")
    .alias("p", "path")
    .alias("webseed", "urllist")
    .alias("priv", "private")
    .array("a")
    .array("httpseed")
    .array("webseed")
    .string("p")
    .boolean("priv")
    .boolean("cwd")
    .string("o")
    .string("source")
    .string("comment")
    .number("piecelength")
    .choices("metaversion", [1, 2, 3])
    .parse();

  const params = [
    args["path"],
    args.announce,
    args.httpseed,
    args.urllist,
    args.piecelength,
    args["private"],
    args.comment,
    args.source,
    args.out,
  ];
  let torrent;
  if (args.metaversion == 1) {
    torrent = new Torrent(...params);
  }
  else if (args.metaversion == 2) {
    torrent = new TorrentV2(...params);
  }
  else {
    torrent = new TorrentV3(...params);
  }
  torrent.assemble();
  torrent.write();
  return torrent;
}

execute();
