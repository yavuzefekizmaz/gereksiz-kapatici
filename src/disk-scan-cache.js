(function(root) {
  class DiskScanCache {
    constructor(){this.results=new Map();this.pending=new Map();}
    has(key){return this.results.has(key)||this.pending.has(key);}
    async get(key,force,scan){
      if(this.pending.has(key))return this.pending.get(key);
      if(!force&&this.results.has(key))return this.results.get(key);
      const pending=Promise.resolve().then(scan).then(files=>{this.results.set(key,files);return files;}).finally(()=>this.pending.delete(key));
      this.pending.set(key,pending);return pending;
    }
    remove(filePath){for(const [key,files] of this.results)this.results.set(key,files.filter(file=>file.path!==filePath));}
  }
  if(typeof module==='object')module.exports=DiskScanCache;else root.DiskScanCache=DiskScanCache;
})(typeof window==='object'?window:globalThis);
