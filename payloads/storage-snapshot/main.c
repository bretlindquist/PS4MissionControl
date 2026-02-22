#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <sys/mount.h>
#include <fcntl.h>
#include <unistd.h>

struct jbc_cred {
    uint32_t uid;
    uint32_t ruid;
    uint32_t svuid;
    uint32_t rgid;
    uint32_t svgid;
    uintptr_t prison;
    uintptr_t cdir;
    uintptr_t rdir;
    uintptr_t jdir;
    uint64_t sceProcType;
    uint64_t sonyCred;
    uint64_t sceProcCap;
};

extern int jbc_get_cred(struct jbc_cred *cred);
extern int jbc_jailbreak_cred(struct jbc_cred *cred);
extern int jbc_set_cred(const struct jbc_cred *cred);

struct storage_stats {
    const char *mount;
    uint64_t total_bytes;
    uint64_t free_bytes;
    uint64_t used_bytes;
};

static uint64_t mul_u64(uint64_t a, uint64_t b) {
    return a * b;
}

static int collect_stats(const char *mount, struct storage_stats *out) {
    struct statfs st;
    if (statfs(mount, &st) != 0) return -1;

    uint64_t block_size = (uint64_t)st.f_bsize;
    uint64_t total = mul_u64((uint64_t)st.f_blocks, block_size);
    uint64_t freeb = mul_u64((uint64_t)st.f_bavail, block_size);
    uint64_t used = total > freeb ? (total - freeb) : 0;

    out->mount = mount;
    out->total_bytes = total;
    out->free_bytes = freeb;
    out->used_bytes = used;
    return 0;
}

static int write_storage_json(const char *path, const char *json, int len) {
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd < 0) return -1;

    int off = 0;
    while (off < len) {
        int wrote = (int)write(fd, json + off, (size_t)(len - off));
        if (wrote <= 0) {
            close(fd);
            return -1;
        }
        off += wrote;
    }

    close(fd);
    return 0;
}

static int buf_append_str(char *buf, int cap, int *off, const char *s) {
    if (!buf || !off || !s) return -1;
    while (*s) {
        if (*off + 1 >= cap) return -1;
        buf[*off] = *s;
        *off += 1;
        s += 1;
    }
    buf[*off] = '\0';
    return 0;
}

static int buf_append_u64(char *buf, int cap, int *off, uint64_t v) {
    char tmp[32];
    int i = 0;
    if (v == 0) {
        tmp[i++] = '0';
    } else {
        while (v > 0 && i < (int)sizeof(tmp)) {
            tmp[i++] = (char)('0' + (v % 10));
            v /= 10;
        }
    }
    if (i <= 0) return -1;
    while (i-- > 0) {
        if (*off + 1 >= cap) return -1;
        buf[*off] = tmp[i];
        *off += 1;
    }
    buf[*off] = '\0';
    return 0;
}

static int append_entry(char *json, int cap, int *off, const char *name, const struct storage_stats *s, int with_comma) {
    if (buf_append_str(json, cap, off, "    \"") != 0) return -1;
    if (buf_append_str(json, cap, off, name) != 0) return -1;
    if (buf_append_str(json, cap, off, "\": {\"mount\": \"") != 0) return -1;
    if (buf_append_str(json, cap, off, s->mount) != 0) return -1;
    if (buf_append_str(json, cap, off, "\", \"total_bytes\": ") != 0) return -1;
    if (buf_append_u64(json, cap, off, s->total_bytes) != 0) return -1;
    if (buf_append_str(json, cap, off, ", \"free_bytes\": ") != 0) return -1;
    if (buf_append_u64(json, cap, off, s->free_bytes) != 0) return -1;
    if (buf_append_str(json, cap, off, ", \"used_bytes\": ") != 0) return -1;
    if (buf_append_u64(json, cap, off, s->used_bytes) != 0) return -1;
    if (buf_append_str(json, cap, off, "}") != 0) return -1;
    if (with_comma && buf_append_str(json, cap, off, ",") != 0) return -1;
    if (buf_append_str(json, cap, off, "\n") != 0) return -1;
    return 0;
}

int main(void) {
    struct jbc_cred cred;
    jbc_get_cred(&cred);
    jbc_jailbreak_cred(&cred);

    cred.jdir = 0;
    cred.sceProcType = 0x3800000000000010;
    cred.sonyCred = 0x40001c0000000000;
    cred.sceProcCap = 0x900000000000ff00;
    jbc_set_cred(&cred);

    struct storage_stats internal = {0};
    struct storage_stats external = {0};

    int has_internal = collect_stats("/user", &internal) == 0;
    int has_external = collect_stats("/mnt/ext0", &external) == 0;

    char json[4096];
    int off = 0;
    json[0] = '\0';

    if (!has_internal) {
        if (buf_append_str(json, sizeof(json), &off,
            "{\n"
            "  \"status\": \"error\",\n"
            "  \"error\": \"failed to stat /user\",\n"
            "  \"storage\": {}\n"
            "}\n") != 0) return 2;
    } else {
        if (buf_append_str(json, sizeof(json), &off,
            "{\n"
            "  \"status\": \"ready\",\n"
            "  \"generated_at\": \"runtime\",\n"
            "  \"storage\": {\n") != 0) return 2;

        if (append_entry(json, sizeof(json), &off, "internal", &internal, 1) != 0) return 2;
        if (has_external) {
            if (append_entry(json, sizeof(json), &off, "external", &external, 0) != 0) return 2;
        } else {
            if (buf_append_str(json, sizeof(json), &off, "    \"external\": null\n") != 0) return 2;
        }
        if (buf_append_str(json, sizeof(json), &off, "  }\n}\n") != 0) return 2;
    }

    if (write_storage_json("/data/ps4-storage.json", json, off) != 0) {
        return 3;
    }

    return 0;
}
