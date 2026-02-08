export namespace claude {
	
	export class Agent {
	    name: string;
	    path: string;
	    isGlobal: boolean;
	    format: string;
	
	    static createFrom(source: any = {}) {
	        return new Agent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isGlobal = source["isGlobal"];
	        this.format = source["format"];
	    }
	}
	export class Command {
	    name: string;
	    path: string;
	    description: string;
	    isGlobal: boolean;
	    content?: string;
	
	    static createFrom(source: any = {}) {
	        return new Command(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.description = source["description"];
	        this.isGlobal = source["isGlobal"];
	        this.content = source["content"];
	    }
	}
	export class Hook {
	    name: string;
	    path: string;
	    type: string;
	    description: string;
	    active: boolean;
	    matcher?: string;
	    command?: string;
	
	    static createFrom(source: any = {}) {
	        return new Hook(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.type = source["type"];
	        this.description = source["description"];
	        this.active = source["active"];
	        this.matcher = source["matcher"];
	        this.command = source["command"];
	    }
	}
	export class HookAction {
	    type: string;
	    command: string;
	    timeout?: number;
	
	    static createFrom(source: any = {}) {
	        return new HookAction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.command = source["command"];
	        this.timeout = source["timeout"];
	    }
	}
	export class HookEntry {
	    eventType: string;
	    matcher: string;
	    description: string;
	    hooks: HookAction[];
	    isInline: boolean;
	    scriptPath: string;
	
	    static createFrom(source: any = {}) {
	        return new HookEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.eventType = source["eventType"];
	        this.matcher = source["matcher"];
	        this.description = source["description"];
	        this.hooks = this.convertValues(source["hooks"], HookAction);
	        this.isInline = source["isInline"];
	        this.scriptPath = source["scriptPath"];
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
	export class LibStatus {
	    name: string;
	    installed: boolean;
	    version?: string;
	    apps?: string[];
	
	    static createFrom(source: any = {}) {
	        return new LibStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.apps = source["apps"];
	    }
	}
	export class MCPServer {
	    name: string;
	    type: string;
	    command: string;
	    args: string[];
	    url: string;
	    env: Record<string, string>;
	    scope: string;
	    disabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new MCPServer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.type = source["type"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.url = source["url"];
	        this.env = source["env"];
	        this.scope = source["scope"];
	        this.disabled = source["disabled"];
	    }
	}
	export class Skill {
	    name: string;
	    path: string;
	    description: string;
	    installed: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Skill(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.description = source["description"];
	        this.installed = source["installed"];
	    }
	}
	export class TemplateItem {
	    name: string;
	    path: string;
	    description: string;
	    category: string;
	    content?: string;
	
	    static createFrom(source: any = {}) {
	        return new TemplateItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.description = source["description"];
	        this.category = source["category"];
	        this.content = source["content"];
	    }
	}

}

export namespace docker {
	
	export class Container {
	    id: string;
	    name: string;
	    image: string;
	    state: string;
	    status: string;
	    ports: string[];
	    created: number;
	
	    static createFrom(source: any = {}) {
	        return new Container(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.image = source["image"];
	        this.state = source["state"];
	        this.status = source["status"];
	        this.ports = source["ports"];
	        this.created = source["created"];
	    }
	}

}

export namespace git {
	
	export class ChangedFile {
	    path: string;
	    status: string;
	    staged: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ChangedFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.status = source["status"];
	        this.staged = source["staged"];
	    }
	}
	export class CommitFile {
	    path: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new CommitFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.status = source["status"];
	    }
	}
	export class CommitStats {
	    filesChanged: number;
	    insertions: number;
	    deletions: number;
	
	    static createFrom(source: any = {}) {
	        return new CommitStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filesChanged = source["filesChanged"];
	        this.insertions = source["insertions"];
	        this.deletions = source["deletions"];
	    }
	}
	export class CommitInfo {
	    hash: string;
	    shortHash: string;
	    subject: string;
	    body: string;
	    author: string;
	    authorEmail: string;
	    date: string;
	    relativeDate: string;
	    files: CommitFile[];
	    stats: CommitStats;
	
	    static createFrom(source: any = {}) {
	        return new CommitInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.shortHash = source["shortHash"];
	        this.subject = source["subject"];
	        this.body = source["body"];
	        this.author = source["author"];
	        this.authorEmail = source["authorEmail"];
	        this.date = source["date"];
	        this.relativeDate = source["relativeDate"];
	        this.files = this.convertValues(source["files"], CommitFile);
	        this.stats = this.convertValues(source["stats"], CommitStats);
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
	
	export class FileDiff {
	    path: string;
	    oldContent: string;
	    newContent: string;
	    diffContent: string;
	
	    static createFrom(source: any = {}) {
	        return new FileDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.oldContent = source["oldContent"];
	        this.newContent = source["newContent"];
	        this.diffContent = source["diffContent"];
	    }
	}

}

export namespace iterm {
	
	export class ITermTab {
	    windowId: number;
	    tabIndex: number;
	    sessionId: string;
	    name: string;
	    path: string;
	    isActive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ITermTab(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.windowId = source["windowId"];
	        this.tabIndex = source["tabIndex"];
	        this.sessionId = source["sessionId"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isActive = source["isActive"];
	    }
	}
	export class ITermStatus {
	    running: boolean;
	    tabs: ITermTab[];
	
	    static createFrom(source: any = {}) {
	        return new ITermStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.tabs = this.convertValues(source["tabs"], ITermTab);
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
	
	export class SessionInfo {
	    name: string;
	    profileName: string;
	    columns: number;
	    rows: number;
	    currentCommand: string;
	    jobPid: number;
	    isProcessing: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SessionInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.profileName = source["profileName"];
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.currentCommand = source["currentCommand"];
	        this.jobPid = source["jobPid"];
	        this.isProcessing = source["isProcessing"];
	    }
	}

}

export namespace main {
	
	export class RemoteAccessStatus {
	    enabled: boolean;
	    savedDevicesOnly: boolean;
	    running: boolean;
	    port: number;
	    localUrl: string;
	    publicUrl: string;
	    token: string;
	    clientCount: number;
	    clients: remote.ClientInfo[];
	
	    static createFrom(source: any = {}) {
	        return new RemoteAccessStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.savedDevicesOnly = source["savedDevicesOnly"];
	        this.running = source["running"];
	        this.port = source["port"];
	        this.localUrl = source["localUrl"];
	        this.publicUrl = source["publicUrl"];
	        this.token = source["token"];
	        this.clientCount = source["clientCount"];
	        this.clients = this.convertValues(source["clients"], remote.ClientInfo);
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
	export class Screenshot {
	    id: string;
	    filename: string;
	    path: string;
	    timestamp: number;
	
	    static createFrom(source: any = {}) {
	        return new Screenshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filename = source["filename"];
	        this.path = source["path"];
	        this.timestamp = source["timestamp"];
	    }
	}
	export class TerminalInfo {
	    id: string;
	    projectId: string;
	    name: string;
	    workDir: string;
	    running: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TerminalInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.name = source["name"];
	        this.workDir = source["workDir"];
	        this.running = source["running"];
	    }
	}

}

export namespace remote {
	
	export class ApprovedClient {
	    token: string;
	    name: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    lastUsed: any;
	
	    static createFrom(source: any = {}) {
	        return new ApprovedClient(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.name = source["name"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.lastUsed = this.convertValues(source["lastUsed"], null);
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
	export class ClientInfo {
	    id: string;
	    // Go type: time
	    connectedAt: any;
	    terminalId: string;
	    userAgent: string;
	    remoteAddr: string;
	
	    static createFrom(source: any = {}) {
	        return new ClientInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.connectedAt = this.convertValues(source["connectedAt"], null);
	        this.terminalId = source["terminalId"];
	        this.userAgent = source["userAgent"];
	        this.remoteAddr = source["remoteAddr"];
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
	export class Config {
	    enabled: boolean;
	    savedDevicesOnly: boolean;
	    port: number;
	    ngrokPlan: string;
	    subdomain: string;
	    tokenExpiry: number;
	    ngrokApiPort: number;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.savedDevicesOnly = source["savedDevicesOnly"];
	        this.port = source["port"];
	        this.ngrokPlan = source["ngrokPlan"];
	        this.subdomain = source["subdomain"];
	        this.tokenExpiry = source["tokenExpiry"];
	        this.ngrokApiPort = source["ngrokApiPort"];
	    }
	}
	export class TerminalInfo {
	    id: string;
	    projectId: string;
	    name: string;
	    workDir: string;
	    running: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TerminalInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.name = source["name"];
	        this.workDir = source["workDir"];
	        this.running = source["running"];
	    }
	}
	export class ProjectInfo {
	    id: string;
	    name: string;
	    path: string;
	    color: string;
	    icon: string;
	    terminals: TerminalInfo[];
	
	    static createFrom(source: any = {}) {
	        return new ProjectInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.color = source["color"];
	        this.icon = source["icon"];
	        this.terminals = this.convertValues(source["terminals"], TerminalInfo);
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

export namespace state {
	
	export class PomodoroSettings {
	    sessionMinutes: number;
	    breakMinutes: number;
	
	    static createFrom(source: any = {}) {
	        return new PomodoroSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionMinutes = source["sessionMinutes"];
	        this.breakMinutes = source["breakMinutes"];
	    }
	}
	export class WindowState {
	    x: number;
	    y: number;
	    width: number;
	    height: number;
	    maximized: boolean;
	
	    static createFrom(source: any = {}) {
	        return new WindowState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.x = source["x"];
	        this.y = source["y"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.maximized = source["maximized"];
	    }
	}
	export class ApprovedRemoteClient {
	    token: string;
	    name: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    lastUsed: any;
	
	    static createFrom(source: any = {}) {
	        return new ApprovedRemoteClient(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.name = source["name"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.lastUsed = this.convertValues(source["lastUsed"], null);
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
	export class TodoItem {
	    id: string;
	    text: string;
	    completed: boolean;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new TodoItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.completed = source["completed"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
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
	export class PromptCategory {
	    id: string;
	    name: string;
	    order: number;
	    isGlobal: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PromptCategory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.order = source["order"];
	        this.isGlobal = source["isGlobal"];
	    }
	}
	export class Prompt {
	    id: string;
	    title: string;
	    content: string;
	    category: string;
	    usageCount: number;
	    pinned: boolean;
	    isGlobal: boolean;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Prompt(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.category = source["category"];
	        this.usageCount = source["usageCount"];
	        this.pinned = source["pinned"];
	        this.isGlobal = source["isGlobal"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
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
	export class TestRun {
	    id: number;
	    terminalId: string;
	    runner: string;
	    status: string;
	    passed: number;
	    failed: number;
	    skipped: number;
	    total: number;
	    duration: number;
	    // Go type: time
	    timestamp: any;
	
	    static createFrom(source: any = {}) {
	        return new TestRun(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.terminalId = source["terminalId"];
	        this.runner = source["runner"];
	        this.status = source["status"];
	        this.passed = source["passed"];
	        this.failed = source["failed"];
	        this.skipped = source["skipped"];
	        this.total = source["total"];
	        this.duration = source["duration"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
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
	export class BrowserTab {
	    id: string;
	    url: string;
	    title: string;
	    active: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BrowserTab(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.url = source["url"];
	        this.title = source["title"];
	        this.active = source["active"];
	    }
	}
	export class Bookmark {
	    id: string;
	    name: string;
	    url: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new Bookmark(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.url = source["url"];
	        this.order = source["order"];
	    }
	}
	export class BrowserState {
	    url: string;
	    deviceIndex: number;
	    rotated: boolean;
	    scale: number;
	    bookmarks: Bookmark[];
	    tabs: BrowserTab[];
	    activeTabId: string;
	
	    static createFrom(source: any = {}) {
	        return new BrowserState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.deviceIndex = source["deviceIndex"];
	        this.rotated = source["rotated"];
	        this.scale = source["scale"];
	        this.bookmarks = this.convertValues(source["bookmarks"], Bookmark);
	        this.tabs = this.convertValues(source["tabs"], BrowserTab);
	        this.activeTabId = source["activeTabId"];
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
	export class TerminalState {
	    id: string;
	    projectId: string;
	    name: string;
	    workDir: string;
	    running: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TerminalState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.projectId = source["projectId"];
	        this.name = source["name"];
	        this.workDir = source["workDir"];
	        this.running = source["running"];
	    }
	}
	export class ProjectState {
	    id: string;
	    name: string;
	    path: string;
	    color: string;
	    icon: string;
	    terminals: Record<string, TerminalState>;
	    activeTerminalId: string;
	    browser?: BrowserState;
	    activeTab: string;
	    splitView: boolean;
	    splitRatio: number;
	    notes: string;
	    testHistory: TestRun[];
	    prompts: Prompt[];
	    promptCategories: PromptCategory[];
	    todos: TodoItem[];
	    browserTabs: string[];
	    envVars: Record<string, string>;
	    // Go type: time
	    lastOpened: any;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new ProjectState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.path = source["path"];
	        this.color = source["color"];
	        this.icon = source["icon"];
	        this.terminals = this.convertValues(source["terminals"], TerminalState, true);
	        this.activeTerminalId = source["activeTerminalId"];
	        this.browser = this.convertValues(source["browser"], BrowserState);
	        this.activeTab = source["activeTab"];
	        this.splitView = source["splitView"];
	        this.splitRatio = source["splitRatio"];
	        this.notes = source["notes"];
	        this.testHistory = this.convertValues(source["testHistory"], TestRun);
	        this.prompts = this.convertValues(source["prompts"], Prompt);
	        this.promptCategories = this.convertValues(source["promptCategories"], PromptCategory);
	        this.todos = this.convertValues(source["todos"], TodoItem);
	        this.browserTabs = source["browserTabs"];
	        this.envVars = source["envVars"];
	        this.lastOpened = this.convertValues(source["lastOpened"], null);
	        this.createdAt = this.convertValues(source["createdAt"], null);
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
	export class AppState {
	    version: number;
	    activeProjectId: string;
	    projects: Record<string, ProjectState>;
	    globalPrompts: Prompt[];
	    globalPromptCategories: PromptCategory[];
	    approvedRemoteClients: ApprovedRemoteClient[];
	    terminalTheme: string;
	    terminalFontSize: number;
	    window?: WindowState;
	    pomodoro?: PomodoroSettings;
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.activeProjectId = source["activeProjectId"];
	        this.projects = this.convertValues(source["projects"], ProjectState, true);
	        this.globalPrompts = this.convertValues(source["globalPrompts"], Prompt);
	        this.globalPromptCategories = this.convertValues(source["globalPromptCategories"], PromptCategory);
	        this.approvedRemoteClients = this.convertValues(source["approvedRemoteClients"], ApprovedRemoteClient);
	        this.terminalTheme = source["terminalTheme"];
	        this.terminalFontSize = source["terminalFontSize"];
	        this.window = this.convertValues(source["window"], WindowState);
	        this.pomodoro = this.convertValues(source["pomodoro"], PomodoroSettings);
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

export namespace structure {
	
	export class FileNode {
	    name: string;
	    path: string;
	    isDir: boolean;
	    children?: FileNode[];
	    fileCount?: number;
	
	    static createFrom(source: any = {}) {
	        return new FileNode(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.children = this.convertValues(source["children"], FileNode);
	        this.fileCount = source["fileCount"];
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

export namespace testing {
	
	export class CoverageDetail {
	    total: number;
	    covered: number;
	    skipped: number;
	    pct: number;
	
	    static createFrom(source: any = {}) {
	        return new CoverageDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.covered = source["covered"];
	        this.skipped = source["skipped"];
	        this.pct = source["pct"];
	    }
	}
	export class CoverageHistoryEntry {
	    // Go type: time
	    timestamp: any;
	    lines: number;
	    functions: number;
	    branches: number;
	
	    static createFrom(source: any = {}) {
	        return new CoverageHistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.lines = source["lines"];
	        this.functions = source["functions"];
	        this.branches = source["branches"];
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
	export class CoverageHistory {
	    entries: CoverageHistoryEntry[];
	
	    static createFrom(source: any = {}) {
	        return new CoverageHistory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entries = this.convertValues(source["entries"], CoverageHistoryEntry);
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
	
	export class CoverageMetrics {
	    lines: CoverageDetail;
	    statements: CoverageDetail;
	    functions: CoverageDetail;
	    branches: CoverageDetail;
	
	    static createFrom(source: any = {}) {
	        return new CoverageMetrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lines = this.convertValues(source["lines"], CoverageDetail);
	        this.statements = this.convertValues(source["statements"], CoverageDetail);
	        this.functions = this.convertValues(source["functions"], CoverageDetail);
	        this.branches = this.convertValues(source["branches"], CoverageDetail);
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
	export class CoverageSummary {
	    total: CoverageMetrics;
	    byFile?: Record<string, CoverageMetrics>;
	    // Go type: time
	    lastUpdated: any;
	    projectPath: string;
	
	    static createFrom(source: any = {}) {
	        return new CoverageSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = this.convertValues(source["total"], CoverageMetrics);
	        this.byFile = this.convertValues(source["byFile"], CoverageMetrics, true);
	        this.lastUpdated = this.convertValues(source["lastUpdated"], null);
	        this.projectPath = source["projectPath"];
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
	export class TestFileInfo {
	    path: string;
	    testCount: number;
	    type: string;
	
	    static createFrom(source: any = {}) {
	        return new TestFileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.testCount = source["testCount"];
	        this.type = source["type"];
	    }
	}
	export class TestDiscovery {
	    totalTests: number;
	    unitTests: number;
	    e2eTests: number;
	    integrationTests: number;
	    testFiles: TestFileInfo[];
	    // Go type: time
	    scannedAt: any;
	    projectPath: string;
	
	    static createFrom(source: any = {}) {
	        return new TestDiscovery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.totalTests = source["totalTests"];
	        this.unitTests = source["unitTests"];
	        this.e2eTests = source["e2eTests"];
	        this.integrationTests = source["integrationTests"];
	        this.testFiles = this.convertValues(source["testFiles"], TestFileInfo);
	        this.scannedAt = this.convertValues(source["scannedAt"], null);
	        this.projectPath = source["projectPath"];
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
	
	export class TestResult {
	    name: string;
	    status: string;
	    duration: number;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.duration = source["duration"];
	        this.error = source["error"];
	    }
	}
	export class TestSummary {
	    runner: string;
	    status: string;
	    passed: number;
	    failed: number;
	    skipped: number;
	    total: number;
	    duration: number;
	    failedTests?: TestResult[];
	    // Go type: time
	    startTime: any;
	    // Go type: time
	    endTime?: any;
	    coveragePercent?: number;
	
	    static createFrom(source: any = {}) {
	        return new TestSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.runner = source["runner"];
	        this.status = source["status"];
	        this.passed = source["passed"];
	        this.failed = source["failed"];
	        this.skipped = source["skipped"];
	        this.total = source["total"];
	        this.duration = source["duration"];
	        this.failedTests = this.convertValues(source["failedTests"], TestResult);
	        this.startTime = this.convertValues(source["startTime"], null);
	        this.endTime = this.convertValues(source["endTime"], null);
	        this.coveragePercent = source["coveragePercent"];
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

