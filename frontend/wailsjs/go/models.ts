export namespace engine {
	
	export class AdapterStatusInfo {
	    id: string;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AdapterStatusInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.active = source["active"];
	    }
	}

}

export namespace storage {
	
	export class AppStatRecord {
	    app_id: string;
	    app_name: string;
	    total_duration_seconds: number;
	    percentage: number;
	
	    static createFrom(source: any = {}) {
	        return new AppStatRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.app_id = source["app_id"];
	        this.app_name = source["app_name"];
	        this.total_duration_seconds = source["total_duration_seconds"];
	        this.percentage = source["percentage"];
	    }
	}
	export class AppUsageStat {
	    label: string;
	    duration_seconds: number;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new AppUsageStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.duration_seconds = source["duration_seconds"];
	        this.url = source["url"];
	    }
	}
	export class SessionRecord {
	    id: number;
	    app_id: string;
	    app_name: string;
	    window_title: string;
	    source: string;
	    url: string;
	    // Go type: time
	    started_at: any;
	    // Go type: time
	    ended_at: any;
	    duration_seconds: number;
	    metadata: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new SessionRecord(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.app_id = source["app_id"];
	        this.app_name = source["app_name"];
	        this.window_title = source["window_title"];
	        this.source = source["source"];
	        this.url = source["url"];
	        this.started_at = this.convertValues(source["started_at"], null);
	        this.ended_at = this.convertValues(source["ended_at"], null);
	        this.duration_seconds = source["duration_seconds"];
	        this.metadata = source["metadata"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

