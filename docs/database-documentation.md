# คำอธิบายการเชื่อมต่อฐานข้อมูลในแอปพลิเคชัน Pong Game

## ภาพรวม

แอปพลิเคชัน Pong Game ใช้ **Firebase Firestore** เป็นฐานข้อมูลออนไลน์ โดยเชื่อมต่อผ่าน **REST API** เพื่อให้ทำงานได้บน React Native โดยไม่ต้องใช้ native dependencies

---

## 1. การเชื่อมต่อฐานข้อมูลออนไลน์ (Firebase Firestore)

### 1.1 การตั้งค่าการเชื่อมต่อ

**ไฟล์:** `lib/firebase.ts`

```typescript
const FIREBASE_PROJECT_ID = 'water-pong';
const FIRESTORE_BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
```

- **Project ID:** `water-pong`
- **Endpoint:** `https://firestore.googleapis.com/v1/projects/water-pong/databases/(default)/documents`

### 1.2 โครงสร้างข้อมูล (Collections)

แอปพลิเคชันใช้ 3 Collections หลัก:

| Collection | คำอธิบาย |
|------------|----------|
| `users` | เก็บข้อมูลผู้เล่น (ชื่อ, วันที่สร้าง, จำนวนชนะ) |
| `scores_first_to_x` | เก็บคะแนนเกมโหมด First to X |
| `scores_time_attack` | เก็บคะแนนเกมโหมด Time Attack |

### 1.3 โครงสร้างข้อมูลผู้เล่น (UserProfile)

**ไฟล์:** `lib/firestore-user.ts`

```typescript
export interface UserProfile {
    uid: string;           // รหัสผู้เล่น (Document ID)
    displayName: string;   // ชื่อผู้เล่น
    createdAt: number;     // วันที่สร้าง (epoch ms)
    updatedAt: number;     // วันที่อัพเดทล่าสุด
    count_win?: number;    // จำนวนครั้งที่ชนะ
}
```

### 1.4 โครงสร้างข้อมูลคะแนน First to X

```typescript
export interface FirebaseFirstToXScore {
    score01_id?: string;           // รหัสคะแนน
    player_id: string;             // รหัสผู้เล่นคนที่ 1
    player_id1: string;            // รหัสผู้เล่นคนที่ 2 (หรือ AI)
    score01_player: number;        // คะแนนผู้เล่นคนที่ 1
    score01_player1: number;       // คะแนนผู้เล่นคนที่ 2
    score01_winner: string;        // รหัสผู้ชนะ
    score01_time_elapse: number;   // เวลาที่ใช้ (วินาที)
    score01_created_date: number;  // วันที่บันทึก
    is_online?: boolean;           // เล่นออนไลน์หรือไม่
}
```

### 1.5 โครงสร้างข้อมูลคะแนน Time Attack

```typescript
export interface FirebaseTimeAttackScore {
    score02_id?: string;            // รหัสคะแนน
    player_id: string;              // รหัสผู้เล่น
    score02_verdict: string;        // ผลลัพธ์ ('WIN' | 'LOSE')
    score02_time_duration: number;  // เวลาที่อยู่รอด (วินาที)
    score02_created_date: number;   // วันที่บันทึก
    is_online?: boolean;            // เล่นออนไลน์หรือไม่
}
```

---

## 2. CRUD Operations

### 2.1 Create (สร้างข้อมูล)

#### สร้างโปรไฟล์ผู้เล่นใหม่

**ฟังก์ชัน:** `createInitialProfile(userId, defaultName)`

```typescript
export async function createInitialProfile(userId: string, defaultName: string = 'Guest'): Promise<void> {
    const existing = await getUserProfile(userId);
    if (!existing) {
        const createUrl = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
        const now = Date.now();
        const data = {
            displayName: defaultName,
            createdAt: now,
            updatedAt: now,
            count_win: 0,
        };

        await fetch(createUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(data)),
        });
    }
}
```

**HTTP Method:** `PATCH`  
**การทำงาน:** สร้าง document ใหม่ใน collection `users` โดยใช้ userId เป็น Document ID

---

#### บันทึกคะแนนเกม First to X

**ฟังก์ชัน:** `firebaseSaveFirstToXScore(score)`

```typescript
export async function firebaseSaveFirstToXScore(
    score: Omit<FirebaseFirstToXScore, 'score01_id'>
): Promise<string | null> {
    const url = `${FIRESTORE_BASE_URL}/${FIRST_TO_X_COLLECTION}`;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toFirestoreDocument(score)),
    });

    if (res.ok) {
        const created = await res.json();
        return created._id;
    }
    return null;
}
```

**HTTP Method:** `POST`  
**การทำงาน:** สร้าง document ใหม่ใน collection `scores_first_to_x`

---

### 2.2 Read (อ่านข้อมูล)

#### ดึงข้อมูลผู้เล่น

**ฟังก์ชัน:** `getUserProfile(userId)`

```typescript
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
    const url = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
    const res = await fetch(url);

    if (res.ok) {
        const doc = await res.json();
        const data = fromFirestoreDocument(doc);
        return {
            uid: userId,
            displayName: data.displayName || 'Guest',
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            count_win: data.count_win || 0,
        };
    }
    return null;
}
```

**HTTP Method:** `GET`  
**การทำงาน:** ดึง document จาก collection `users` โดยใช้ userId

---

#### ดึง Leaderboard (เรียงตามจำนวนชนะ)

**ฟังก์ชัน:** `getLeaderboard(limit)`

```typescript
export async function getLeaderboard(limit: number = 50): Promise<UserProfile[]> {
    const url = `${FIRESTORE_BASE_URL}:runQuery`;

    const query = {
        structuredQuery: {
            from: [{ collectionId: USERS_COLLECTION }],
            orderBy: [
                { field: { fieldPath: 'count_win' }, direction: 'DESCENDING' }
            ],
            limit: limit
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
    });

    // ... process results
}
```

**HTTP Method:** `POST` (runQuery)  
**การทำงาน:** Query ข้อมูลจาก collection `users` เรียงลำดับตาม `count_win` จากมากไปน้อย

---

### 2.3 Update (แก้ไขข้อมูล)

#### อัพเดทชื่อผู้เล่น

**ฟังก์ชัน:** `updateUserProfile(userId, displayName)`

```typescript
export async function updateUserProfile(userId: string, displayName: string): Promise<boolean> {
    const url = `${FIRESTORE_BASE_URL}/${USERS_COLLECTION}/${userId}`;
    const now = Date.now();
    const data = {
        displayName,
        updatedAt: now,
    };

    const res = await fetch(
        `${url}?updateMask.fieldPaths=displayName&updateMask.fieldPaths=updatedAt`, 
        {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(toFirestoreDocument(data)),
        }
    );

    return res.ok;
}
```

**HTTP Method:** `PATCH`  
**การทำงาน:** อัพเดทเฉพาะ field `displayName` และ `updatedAt` ใน document

---

#### เพิ่มจำนวนชนะ (Increment)

**ฟังก์ชัน:** `incrementUserWin(userId)`

```typescript
export async function incrementUserWin(userId: string): Promise<void> {
    const url = `${FIRESTORE_BASE_URL}:commit`;
    const fullPath = `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${USERS_COLLECTION}/${userId}`;

    const commitBody = {
        writes: [
            {
                transform: {
                    document: fullPath,
                    fieldTransforms: [
                        {
                            fieldPath: 'count_win',
                            increment: { integerValue: '1' }
                        }
                    ]
                }
            }
        ]
    };

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(commitBody),
    });
}
```

**HTTP Method:** `POST` (commit)  
**การทำงาน:** ใช้ field transform เพื่อ increment ค่า `count_win` ทีละ 1

---

### 2.4 Delete (ลบข้อมูล)

#### ลบคะแนน First to X

**ฟังก์ชัน:** `firebaseDeleteFirstToXScore(scoreId)`

```typescript
export async function firebaseDeleteFirstToXScore(scoreId: string): Promise<boolean> {
    const url = `${FIRESTORE_BASE_URL}/${FIRST_TO_X_COLLECTION}/${scoreId}`;
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok || res.status === 404;
}
```

**HTTP Method:** `DELETE`  
**การทำงาน:** ลบ document จาก collection `scores_first_to_x`

---

#### ลบคะแนน Time Attack

**ฟังก์ชัน:** `firebaseDeleteTimeAttackScore(scoreId)`

```typescript
export async function firebaseDeleteTimeAttackScore(scoreId: string): Promise<boolean> {
    const url = `${FIRESTORE_BASE_URL}/${TIME_ATTACK_COLLECTION}/${scoreId}`;
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok || res.status === 404;
}
```

**HTTP Method:** `DELETE`  
**การทำงาน:** ลบ document จาก collection `scores_time_attack`

---

## 3. Helper Functions สำหรับแปลงข้อมูล

Firestore REST API ต้องการข้อมูลในรูปแบบเฉพาะ ดังนั้นจึงต้องมีฟังก์ชันช่วยแปลงข้อมูล:

### แปลงค่าเป็นรูปแบบ Firestore

```typescript
function toFirestoreValue(value: any): any {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') {
        if (Number.isInteger(value)) return { integerValue: String(value) };
        return { doubleValue: value };
    }
    if (typeof value === 'boolean') return { booleanValue: value };
    // ... etc
}
```

### แปลงจากรูปแบบ Firestore กลับมา

```typescript
function fromFirestoreValue(value: any): any {
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue);
    if (value.doubleValue !== undefined) return value.doubleValue;
    // ... etc
}
```

---

## 4. สรุปการใช้งาน CRUD (Firebase Firestore)

| Operation | HTTP Method | ฟังก์ชัน | คำอธิบาย |
|-----------|-------------|----------|----------|
| **Create** | POST / PATCH | `createInitialProfile()` | สร้างโปรไฟล์ผู้เล่นใหม่ |
| **Create** | POST | `firebaseSaveFirstToXScore()` | บันทึกคะแนน First to X |
| **Create** | POST | `firebaseSaveTimeAttackScore()` | บันทึกคะแนน Time Attack |
| **Read** | GET | `getUserProfile()` | ดึงข้อมูลผู้เล่น |
| **Read** | POST (Query) | `getLeaderboard()` | ดึง Leaderboard |
| **Read** | POST (Query) | `firebaseGetFirstToXScores()` | ดึงคะแนน First to X |
| **Read** | POST (Query) | `firebaseGetTimeAttackScores()` | ดึงคะแนน Time Attack |
| **Update** | PATCH | `updateUserProfile()` | แก้ไขชื่อผู้เล่น |
| **Update** | POST (Commit) | `incrementUserWin()` | เพิ่มจำนวนชนะ |
| **Delete** | DELETE | `firebaseDeleteFirstToXScore()` | ลบคะแนน First to X |
| **Delete** | DELETE | `firebaseDeleteTimeAttackScore()` | ลบคะแนน Time Attack |

---

## 5. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `lib/firebase.ts` | จัดการ Firestore REST API สำหรับ Scores |
| `lib/firestore-user.ts` | จัดการข้อมูลผู้เล่น (Users Collection) |
| `lib/db.ts` | Wrapper/Facade รวมฟังก์ชันทั้งหมด |
| `lib/sqlite.ts` | จัดการ SQLite Local Database |

---

# ส่วนที่ 2: การเชื่อมต่อฐานข้อมูล SQLite (Local Database)

## 1. การเชื่อมต่อฐานข้อมูล SQLite

### 1.1 การติดตั้ง Library

**Library:** `expo-sqlite`

```bash
npx expo install expo-sqlite
```

### 1.2 การตั้งค่าการเชื่อมต่อ

**ไฟล์:** `lib/sqlite.ts`

```typescript
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'pong_game.db';
let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  // ... สร้าง tables
}
```

- **Database Name:** `pong_game.db`
- **Storage:** เก็บในเครื่อง (Local Storage)

---

## 2. โครงสร้างตาราง (Tables)

### 2.1 ตาราง players

```sql
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  player_created_date INTEGER NOT NULL,
  count_win INTEGER DEFAULT 0,
  count_lose INTEGER DEFAULT 0
);
```

| Column | Type | คำอธิบาย |
|--------|------|----------|
| player_id | TEXT | รหัสผู้เล่น (Primary Key) |
| player_name | TEXT | ชื่อผู้เล่น |
| player_created_date | INTEGER | วันที่สร้าง (epoch ms) |
| count_win | INTEGER | จำนวนครั้งที่ชนะ |
| count_lose | INTEGER | จำนวนครั้งที่แพ้ |

### 2.2 ตาราง scores_first_to_x

```sql
CREATE TABLE IF NOT EXISTS scores_first_to_x (
  score01_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  player_id1 TEXT NOT NULL,
  score01_player INTEGER NOT NULL,
  score01_player1 INTEGER NOT NULL,
  score01_winner TEXT NOT NULL,
  score01_time_elapse INTEGER NOT NULL,
  score01_created_date INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);
```

| Column | Type | คำอธิบาย |
|--------|------|----------|
| score01_id | TEXT | รหัสคะแนน (Primary Key) |
| player_id | TEXT | รหัสผู้เล่นคนที่ 1 |
| player_id1 | TEXT | รหัสผู้เล่นคนที่ 2 หรือ AI |
| score01_player | INTEGER | คะแนนผู้เล่นคนที่ 1 |
| score01_player1 | INTEGER | คะแนนผู้เล่นคนที่ 2 |
| score01_winner | TEXT | รหัสผู้ชนะ |
| score01_time_elapse | INTEGER | เวลาที่ใช้ (วินาที) |
| score01_created_date | INTEGER | วันที่บันทึก |
| synced | INTEGER | สถานะ sync (0=ยังไม่ sync, 1=sync แล้ว) |

### 2.3 ตาราง scores_time_attack

```sql
CREATE TABLE IF NOT EXISTS scores_time_attack (
  score02_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  score02_verdict TEXT NOT NULL,
  score02_time_duration INTEGER NOT NULL,
  score02_created_date INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);
```

---

## 3. SQLite CRUD Operations

### 3.1 Create (สร้างข้อมูล)

#### สร้างผู้เล่นใหม่

**ฟังก์ชัน:** `sqliteCreatePlayer(player)`

```typescript
export async function sqliteCreatePlayer(player: Omit<SQLitePlayer, 'count_win' | 'count_lose'>): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT OR REPLACE INTO players (player_id, player_name, player_created_date, count_win, count_lose)
     VALUES (?, ?, ?, 0, 0)`,
    [player.player_id, player.player_name, player.player_created_date]
  );
}
```

**SQL Statement:** `INSERT OR REPLACE INTO`

---

#### บันทึกคะแนน First to X

**ฟังก์ชัน:** `sqliteSaveFirstToXScore(score)`

```typescript
export async function sqliteSaveFirstToXScore(score: Omit<SQLiteFirstToXScore, 'synced'>): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `INSERT INTO scores_first_to_x 
     (score01_id, player_id, player_id1, score01_player, score01_player1, score01_winner, score01_time_elapse, score01_created_date, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [score01_id, player_id, player_id1, ...]
  );
}
```

**SQL Statement:** `INSERT INTO`

---

### 3.2 Read (อ่านข้อมูล)

#### ดึงข้อมูลผู้เล่น

**ฟังก์ชัน:** `sqliteGetPlayer(playerId)`

```typescript
export async function sqliteGetPlayer(playerId: string): Promise<SQLitePlayer | null> {
  const database = await getDb();
  const result = await database.getFirstAsync<SQLitePlayer>(
    'SELECT * FROM players WHERE player_id = ?',
    [playerId]
  );
  return result || null;
}
```

**SQL Statement:** `SELECT * FROM ... WHERE`

---

#### ดึงคะแนนเกม

**ฟังก์ชัน:** `sqliteGetFirstToXScores(playerId, limit)`

```typescript
export async function sqliteGetFirstToXScores(playerId?: string, limit: number = 50): Promise<SQLiteFirstToXScore[]> {
  const database = await getDb();
  
  if (playerId) {
    return await database.getAllAsync<SQLiteFirstToXScore>(
      `SELECT * FROM scores_first_to_x 
       WHERE player_id = ? OR player_id1 = ?
       ORDER BY score01_created_date DESC LIMIT ?`,
      [playerId, playerId, limit]
    );
  }
  
  return await database.getAllAsync<SQLiteFirstToXScore>(
    'SELECT * FROM scores_first_to_x ORDER BY score01_created_date DESC LIMIT ?',
    [limit]
  );
}
```

**SQL Statement:** `SELECT * FROM ... ORDER BY ... LIMIT`

---

### 3.3 Update (แก้ไขข้อมูล)

#### อัพเดทข้อมูลผู้เล่น

**ฟังก์ชัน:** `sqliteUpdatePlayer(playerId, updates)`

```typescript
export async function sqliteUpdatePlayer(playerId: string, updates: Partial<SQLitePlayer>): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    `UPDATE players SET player_name = ? WHERE player_id = ?`,
    [updates.player_name, playerId]
  );
}
```

**SQL Statement:** `UPDATE ... SET ... WHERE`

---

#### เพิ่มจำนวนชนะ

**ฟังก์ชัน:** `sqliteIncrementWin(playerId)`

```typescript
export async function sqliteIncrementWin(playerId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync(
    'UPDATE players SET count_win = count_win + 1 WHERE player_id = ?',
    [playerId]
  );
}
```

**SQL Statement:** `UPDATE ... SET count_win = count_win + 1`

---

### 3.4 Delete (ลบข้อมูล)

#### ลบผู้เล่น

**ฟังก์ชัน:** `sqliteDeletePlayer(playerId)`

```typescript
export async function sqliteDeletePlayer(playerId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM players WHERE player_id = ?', [playerId]);
}
```

**SQL Statement:** `DELETE FROM ... WHERE`

---

#### ลบคะแนน

**ฟังก์ชัน:** `sqliteDeleteFirstToXScore(scoreId)`

```typescript
export async function sqliteDeleteFirstToXScore(scoreId: string): Promise<void> {
  const database = await getDb();
  await database.runAsync('DELETE FROM scores_first_to_x WHERE score01_id = ?', [scoreId]);
}
```

---

## 4. สรุป SQLite CRUD Operations

| Operation | SQL Statement | ฟังก์ชัน | คำอธิบาย |
|-----------|---------------|----------|----------|
| **Create** | INSERT INTO | `sqliteCreatePlayer()` | สร้างผู้เล่นใหม่ |
| **Create** | INSERT INTO | `sqliteSaveFirstToXScore()` | บันทึกคะแนน First to X |
| **Create** | INSERT INTO | `sqliteSaveTimeAttackScore()` | บันทึกคะแนน Time Attack |
| **Read** | SELECT | `sqliteGetPlayer()` | ดึงข้อมูลผู้เล่น |
| **Read** | SELECT | `sqliteGetAllPlayers()` | ดึงผู้เล่นทั้งหมด |
| **Read** | SELECT | `sqliteGetFirstToXScores()` | ดึงคะแนน First to X |
| **Read** | SELECT | `sqliteGetTimeAttackScores()` | ดึงคะแนน Time Attack |
| **Update** | UPDATE | `sqliteUpdatePlayer()` | แก้ไขข้อมูลผู้เล่น |
| **Update** | UPDATE | `sqliteIncrementWin()` | เพิ่มจำนวนชนะ |
| **Update** | UPDATE | `sqliteMarkFirstToXSynced()` | อัพเดทสถานะ sync |
| **Delete** | DELETE | `sqliteDeletePlayer()` | ลบผู้เล่น |
| **Delete** | DELETE | `sqliteDeleteFirstToXScore()` | ลบคะแนน First to X |
| **Delete** | DELETE | `sqliteDeleteTimeAttackScore()` | ลบคะแนน Time Attack |

---

## 5. การทำงานร่วมกันระหว่าง SQLite และ Firebase

แอปพลิเคชันใช้ทั้ง 2 ฐานข้อมูลทำงานร่วมกัน:

```
┌─────────────────────────────────────────────────────────────┐
│                       แอปพลิเคชัน                           │
│                                                             │
│  ┌─────────────┐      ┌─────────────┐                      │
│  │  บันทึกคะแนน │ ───▶ │   SQLite    │  (1) บันทึก Local   │
│  └─────────────┘      └──────┬──────┘                      │
│                              │                              │
│                              ▼                              │
│                       ┌─────────────┐                      │
│                       │  Firebase   │  (2) Sync Online     │
│                       └─────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

**ลำดับการทำงาน:**
1. บันทึกข้อมูลลง **SQLite** ก่อน (ทำงานได้แม้ไม่มีอินเทอร์เน็ต)
2. Sync ข้อมูลไป **Firebase** (สำหรับ Leaderboard และ Backup)
3. อัพเดทสถานะ `synced = 1` ใน SQLite เมื่อ sync สำเร็จ

**ข้อดี:**
- ✅ ทำงานได้แม้ไม่มีอินเทอร์เน็ต (Offline-first)
- ✅ ข้อมูลไม่หายเมื่อ network ล้มเหลว
- ✅ Leaderboard และ Online features ยังทำงานได้

---

## 6. สรุปไฟล์ทั้งหมด

| ไฟล์ | ประเภท | หน้าที่ |
|------|--------|--------|
| `lib/sqlite.ts` | SQLite (Local) | จัดการฐานข้อมูล local |
| `lib/firebase.ts` | Firebase (Online) | จัดการ Firestore REST API |
| `lib/firestore-user.ts` | Firebase (Online) | จัดการ Users Collection |
| `lib/db.ts` | Wrapper | รวมทั้ง SQLite + Firebase |
