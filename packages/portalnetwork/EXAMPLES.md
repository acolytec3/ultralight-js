# Using the Portal Network REPL Client

This document explains the usage and functionality of the Portal Network REPL client script. The script initializes a Portal Network node and allows interaction with it via a REPL (Read-Eval-Print Loop) interface.

## Initialization

The script can be started directly and initializes a Portal Network node with a REPL interface. It binds to a specified UDP port (default: `9090`).

### Start the Client

```bash
npx tsx examples/portalReplClient.ts
```

The REPL interface will start with the `portal>` prompt.

### Default Options

| Option    | Description                      | Default |
|-----------|----------------------------------|---------|
| `--port`  | Port number for the UDP binding  | `9090`  |

---

## Supported Networks

The client supports two Portal Network types:
- **History Network** (`0x500b`)
- **State Network** (`0x500a`)

---

## REPL Commands

The following commands are supported in the REPL interface:

### 1. `debug`
Set debug topics for logging.

**Usage**:
```bash
portal> .debug <topics>
```
**Example**:
```bash
portal> .debug *Portal*,*uTP*
```

---

### 2. `bootstrap`
Bootstrap the Portal Network by connecting to default bootnodes.

**Usage**:
```bash
portal> .bootstrap
```

---

### 3. `ping`
Send a ping to a specified network.

**Usage**:
```bash
portal> .ping <network>
```
**Example**:
```bash
portal> .ping history
```

---

### 4. `findnodes`
Find nodes in the network by ENR and distance(s).

**Usage**:
```bash
portal> .findnodes <network> <enr> <distances>
```
**Example**:
```bash
portal> .findnodes history enr:-... 256 512
```

---

### 5. `findcontent`
Find content by content key in the network.

**Usage**:
```bash
portal> .findcontent <network> <enr> <contentKey>
```
**Example**:
```bash
portal> .findcontent history enr:-... 0xabc123
```

---

### 6. `offer`
Offer content to a specific network.

**Usage**:
```bash
portal> .offer <network> <enr> <contentKey> <contentValue>
```
**Example**:
```bash
portal> .offer state enr:-... 0xabc123 "Hello World"
```

---

### 7. `addENR`
Add an ENR to the local routing table.

**Usage**:
```bash
portal> .addENR <network> <enr>
```
**Example**:
```bash
portal> .addENR history enr:-...
```

---

### 8. `status`
Display the current status of the Portal Network node.

**Usage**:
```bash
portal> .status
```

---

## Example Workflow

1. **Initialize the Portal Network node**:
   ```bash
   npx tsx examples/portalReplClient.ts
   ```

2. **Bootstrap the network**:
   ```bash
   portal> .bootstrap
   ```

3. **Send a ping to the History Network**:
   ```bash
   portal> .ping history
   ```

4. **Find nodes in the State Network**:
   ```bash
   portal> .findnodes state enr:-... 246 256
   ```

5. **Offer content to the History Network**:
   ```bash
   portal> .offer history enr:-... 0xkey "sample content"
   ```

6. **Check the status**:
   ```bash
   portal> .status
   ```

---

## Notes

- Replace `enr:-...` with the actual ENR (Ethereum Node Record) for the target node.
- Use valid `contentKey` (hex strings) and `contentValue` (text strings) for `findcontent` and `offer` commands.
- Logs can be customized using the `.debug` command with appropriate topics.
