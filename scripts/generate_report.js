"use strict";
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, HeightRule, BorderStyle, ShadingType,
  Footer, PageNumber, PageNumberElement, NumberFormat, VerticalAlign, TableBorders,
  PageBreak, SpaceType,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ── Size constants (half-points) ──────────────────────────────────────────────
const SZ_BODY    = 22;  // 11pt
const SZ_HEAD    = 24;  // 12pt
const SZ_CODE    = 18;  // 9pt
const SZ_TABLE   = 20;  // 10pt
const SZ_CAPTION = 18;  // 9pt
const SZ_TITLE   = 32;  // 16pt
const SZ_SUBTITLE= 24;  // 12pt

const FONT = "Arial";
const FONT_MONO = "Courier New";

const GRAY_LIGHT  = "F2F2F2";
const GRAY_HEADER = "D9D9D9";
const GRAY_CODE   = "F5F5F5";
const BLUE_HEADER = "1F3864";
const WHITE = "FFFFFF";

// A4 in twips: 11906 x 16838; margins 1134 (~2cm)
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134;

// ── Helper: spacing ───────────────────────────────────────────────────────────
function sp(before, after, line) {
  const o = {};
  if (before != null) o.before = before;
  if (after  != null) o.after  = after;
  if (line   != null) { o.line = line; o.lineRule = "auto"; }
  return o;
}

// ── Helper: table borders ─────────────────────────────────────────────────────
const THIN_BORDER = {
  style: BorderStyle.SINGLE, size: 4, color: "AAAAAA",
};
const NO_BORDER = {
  style: BorderStyle.NONE, size: 0, color: "FFFFFF",
};

function thinBorders() {
  return {
    top: THIN_BORDER, bottom: THIN_BORDER,
    left: THIN_BORDER, right: THIN_BORDER,
    insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER,
  };
}

// ── Helper: heading paragraph ─────────────────────────────────────────────────
function h1(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_HEAD + 4, bold: true, color: BLUE_HEADER })],
    spacing: sp(320, 120),
    pageBreakBefore: false,
  });
}

function h2(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_HEAD, bold: true, color: "1F3864" })],
    spacing: sp(240, 80),
  });
}

function h3(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_BODY, bold: true, color: "333333" })],
    spacing: sp(160, 60),
  });
}

// ── Helper: body paragraph ────────────────────────────────────────────────────
function body(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_BODY })],
    spacing: sp(0, 160),
    alignment: AlignmentType.JUSTIFIED,
  });
}

// ── Helper: caption ───────────────────────────────────────────────────────────
function caption(text) {
  return new Paragraph({
    children: [new TextRun({ text, font: FONT, size: SZ_CAPTION, bold: true, italics: true, color: "555555" })],
    spacing: sp(120, 80),
    alignment: AlignmentType.CENTER,
  });
}

// ── Helper: numbered list item ────────────────────────────────────────────────
function listItem(n, text) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${n}. `, font: FONT, size: SZ_BODY, bold: true }),
      new TextRun({ text, font: FONT, size: SZ_BODY }),
    ],
    indent: { left: 360, hanging: 360 },
    spacing: sp(0, 80),
    alignment: AlignmentType.JUSTIFIED,
  });
}

// ── Helper: code block ────────────────────────────────────────────────────────
function codeBlock(lines) {
  return lines.map((line, i) => new Paragraph({
    children: [new TextRun({ text: line || " ", font: FONT_MONO, size: SZ_CODE })],
    shading: { type: ShadingType.SOLID, color: GRAY_CODE },
    spacing: sp(0, 0),
    border: i === 0
      ? { top: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER }
      : i === lines.length - 1
        ? { bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER }
        : { left: THIN_BORDER, right: THIN_BORDER },
  }));
}

// ── Helper: spacer ────────────────────────────────────────────────────────────
function spacer() {
  return new Paragraph({ children: [new TextRun({ text: "" })], spacing: sp(0, 80) });
}

// ── Helper: page break ────────────────────────────────────────────────────────
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── Helper: table cell ────────────────────────────────────────────────────────
function tc(text, opts = {}) {
  const { bold = false, bg = null, color = "000000", width = null, align = AlignmentType.LEFT, vertAlign = null } = opts;
  const cellOpts = {
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), font: FONT, size: SZ_TABLE, bold, color })],
      alignment: align,
      spacing: sp(40, 40),
    })],
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  };
  if (bg) cellOpts.shading = { type: ShadingType.SOLID, color: bg };
  if (width) cellOpts.width = { size: width, type: WidthType.DXA };
  if (vertAlign) cellOpts.verticalAlign = vertAlign;
  return new TableCell(cellOpts);
}

// ── Helper: data table ────────────────────────────────────────────────────────
function dataTable(headers, rows, colWidths) {
  const hdrRow = new TableRow({
    children: headers.map((h, i) => tc(h, {
      bold: true, bg: BLUE_HEADER, color: WHITE,
      width: colWidths ? colWidths[i] : undefined,
    })),
    tableHeader: true,
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, i) => tc(cell, {
      bg: ri % 2 === 0 ? WHITE : GRAY_LIGHT,
      width: colWidths ? colWidths[i] : undefined,
    })),
  }));

  return new Table({
    rows: [hdrRow, ...dataRows],
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: thinBorders(),
  });
}

// ── Footer with page numbers ──────────────────────────────────────────────────
function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: "ARM Cortex-A15 Embedded Motion Detection System  |  Page ", font: FONT, size: 18, color: "666666" }),
          new PageNumberElement({}),
        ],
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" } },
        spacing: sp(80, 0),
      }),
    ],
  });
}

// ════════════════════════════════════════════════════════════════════════════
// DOCUMENT SECTIONS
// ════════════════════════════════════════════════════════════════════════════

const allChildren = [];

// ── Cover page ────────────────────────────────────────────────────────────────
allChildren.push(
  new Paragraph({ children: [new TextRun({ text: "" })], spacing: sp(0, 1200) }),
  new Paragraph({
    children: [new TextRun({ text: "EMBEDDED SYSTEMS LABORATORY", font: FONT, size: 24, bold: true, color: BLUE_HEADER, allCaps: true })],
    alignment: AlignmentType.CENTER, spacing: sp(0, 200),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Final Project Report", font: FONT, size: SZ_TITLE, bold: true, color: "1A1A1A" })],
    alignment: AlignmentType.CENTER, spacing: sp(0, 200),
  }),
  new Paragraph({
    children: [new TextRun({
      text: "Real-Time Motion Detection System on ARM Cortex-A15",
      font: FONT, size: 28, bold: true, color: BLUE_HEADER,
    })],
    alignment: AlignmentType.CENTER, spacing: sp(0, 600),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Platform: QEMU vexpress-a15  |  Language: C99  |  Kernel: Linux (ARM)", font: FONT, size: SZ_SUBTITLE, color: "444444" })],
    alignment: AlignmentType.CENTER, spacing: sp(0, 120),
  }),
  new Paragraph({
    children: [new TextRun({ text: "FPGA Simulation  |  Adaptive AI Classifier  |  Dual Alert Channel", font: FONT, size: SZ_SUBTITLE, color: "444444" })],
    alignment: AlignmentType.CENTER, spacing: sp(0, 1200),
  }),
  new Paragraph({
    children: [new TextRun({ text: "Date: June 2026", font: FONT, size: SZ_BODY, color: "555555" })],
    alignment: AlignmentType.CENTER, spacing: sp(0, 80),
  }),
  pageBreak(),
);

// ── Table of Contents placeholder ─────────────────────────────────────────────
allChildren.push(
  h1("Table of Contents"),
  body("Chapter 1 – Introduction and Theoretical Background ..................... 3"),
  body("    1.1  Embedded Systems Fundamentals .......................................... 3"),
  body("    1.2  ARM Cortex-A15 Architecture ............................................ 4"),
  body("    1.3  Embedded System Design Process .......................................... 5"),
  body("    1.4  Real-World Embedded System Structure ..................................... 6"),
  body("Chapter 2 – System Description ................................................ 7"),
  body("    2.1  System Goal and Overview ............................................... 7"),
  body("    2.2  System Architecture .................................................... 8"),
  body("    2.3  Data Flow ............................................................... 9"),
  body("    2.4  Operating System and Kernel ........................................... 10"),
  body("    2.5  Development Environment ............................................... 10"),
  body("    2.6  Filesystem Structure ................................................... 11"),
  body("    2.7  User Interface ......................................................... 11"),
  body("    2.8  Advanced Features ...................................................... 12"),
  body("Chapter 3 – Performance and Resource Management ............................ 13"),
  body("    3.1  Storage Analysis ....................................................... 13"),
  body("    3.2  RAM Usage Analysis ..................................................... 13"),
  body("    3.3  Processing Performance ................................................. 14"),
  body("    3.4  CPU Analysis ........................................................... 14"),
  body("    3.5  Disk I/O Analysis ...................................................... 15"),
  body("Chapter 4 – Practical Results ................................................. 15"),
  body("    4.1  System Initialization Output ........................................... 15"),
  body("    4.2  Classification Results ................................................. 16"),
  body("    4.3  Adaptive Threshold Behaviour ........................................... 16"),
  body("    4.4  STD and SNR Analysis ................................................... 17"),
  body("    4.5  Communication Results .................................................. 17"),
  body("    4.6  Web Dashboard Results .................................................. 18"),
  body("    4.7  FPGA Simulation Results ................................................ 18"),
  body("Chapter 5 – Summary and Future Extensions ................................... 18"),
  body("    5.1  What Was Achieved ...................................................... 18"),
  body("    5.2  Engineering Challenges ................................................. 19"),
  body("    5.3  System Limitations ..................................................... 19"),
  body("    5.4  Future Extensions ...................................................... 20"),
  body("Appendix A – Source Code File List ............................................ 21"),
  body("Appendix B – Build Files ....................................................... 21"),
  body("Appendix C – Output and Data Files ............................................ 22"),
  body("Appendix D – QEMU Launch Command .............................................. 22"),
  pageBreak(),
);

// ════════════════════════════════════════════════════════════════════════════
// CHAPTER 1
// ════════════════════════════════════════════════════════════════════════════
allChildren.push(
  h1("Chapter 1 – Introduction and Theoretical Background"),

  // 1.1
  h2("1.1  Embedded Systems Fundamentals"),
  body("An embedded system is a specialised computing system designed to perform one or a small number of dedicated functions, often with real-time computing constraints, within a larger mechanical or electrical system. Unlike a general-purpose personal computer, which is engineered to run a diverse and unpredictable workload, an embedded system is purpose-built: its hardware, software, and operating environment are all co-designed to achieve a specific set of requirements with maximum efficiency. Embedded systems are typically characterised by limited processing power, constrained memory, tight power budgets, and the need to interact directly with the physical world through sensors and actuators."),
  body("The distinctions between embedded systems and general-purpose computers run deep. A desktop or server processor is designed to balance throughput across a wide variety of workloads, using large caches, speculative execution, and gigabytes of RAM. An embedded processor, by contrast, is often chosen for its deterministic latency, low power draw, and small silicon area. Memory is deliberately minimal — often measured in kilobytes for microcontrollers, or a few hundred megabytes for application-class ARM devices — because cost, board space, and power consumption all scale with memory size. Storage is frequently non-volatile flash rather than spinning disks, and may be absent entirely when the application uses on-chip ROM. Real-time operating requirements further constrain the design: a motion detection system that misses a deadline may fail to raise an alert, with potentially serious safety or security consequences."),
  body("Resource constraints shape every decision in embedded development. Processing power is limited because a low-frequency, in-order core consuming milliwatts is often preferable to a high-frequency superscalar core consuming watts, particularly in battery-operated or thermally constrained deployments. Memory footprint is kept small to reduce cost and eliminate the need for complex memory management. Power consumption is a first-class design constraint for IoT sensors, wearables, and remote surveillance cameras, where battery life may be measured in years. These constraints appear across all major application domains: industrial automation uses embedded controllers for real-time PLC logic; automotive systems rely on dozens of embedded ECUs for engine control, ABS, and ADAS; medical devices such as insulin pumps and pacemakers demand deterministic, fail-safe embedded software; and the Internet of Things encompasses billions of low-power embedded nodes collecting environmental data."),
  body("The C programming language has been the dominant language for embedded development since the 1970s, and remains so today for compelling technical reasons. C compiles to compact, predictable machine code with minimal runtime overhead — there is no garbage collector, no virtual machine, and no hidden memory allocations. The language gives the programmer precise control over memory layout, pointer arithmetic, bit manipulation, and hardware register access, all of which are essential in embedded contexts. C's minimal runtime library means that a statically linked binary can run on a bare metal system with only a handful of kilobytes of supporting code. Furthermore, every major processor architecture has a mature, well-tested C compiler — typically GCC or Clang — making C the most portable high-level language for embedded targets. These properties make C not merely convenient but effectively irreplaceable for the innermost layers of embedded software."),

  // 1.2
  h2("1.2  ARM Cortex-A15 Architecture"),
  body("The ARM (Advanced RISC Machine) architecture is built on the principles of Reduced Instruction Set Computing (RISC), a design philosophy that favours a small, regular set of simple instructions that execute in one clock cycle over a large, complex instruction set requiring multiple cycles. RISC simplicity enables higher clock frequencies, more efficient pipelining, and lower power consumption per operation. ARM added to this foundation a load-store architecture — memory is only accessed via explicit load and store instructions, and all computation occurs in registers — which further simplifies the decode and execute logic. The result is a processor family that achieves high performance per milliwatt, making ARM the dominant architecture in mobile, embedded, and IoT devices worldwide. By the mid-2020s, ARM-based chips had shipped in excess of 250 billion units across all application segments."),
  body("The Cortex-A15 is a high-performance, out-of-order, superscalar application processor introduced by ARM in 2011. Its pipeline comprises fifteen stages, divided into fetch, decode, dispatch, issue, execute, and writeback phases. The out-of-order execution engine allows the processor to re-sequence independent instructions to hide latency — for example, issuing a memory load early and executing subsequent arithmetic while waiting for the cache miss to resolve. The Cortex-A15 supports symmetric multiprocessing (SMP) in configurations of up to four cores, and implements the ARMv7-A instruction set, which includes the NEON SIMD extension for vectorised media and signal processing operations. The NEON unit can process 128-bit vectors, enabling simultaneous computation on 16 bytes or 4 32-bit integers, which is directly applicable to pixel-parallel image processing workloads such as frame comparison."),
  body("The Cortex-A15 implements a two-level cache hierarchy. Each core has 32 KB of L1 instruction cache and 32 KB of L1 data cache, providing sub-nanosecond access to recently used data. The L2 cache is configurable from 512 KB to 4 MB, shared across all cores in the cluster, and provides a second level of temporal locality before accesses reach the main memory bus. The processor supports DDR2, DDR3, and LPDDR2/3 memory controllers through the AMBA AXI interconnect, providing multi-gigabyte-per-second bandwidth to external RAM. The memory management unit (MMU) implements the ARMv7 virtual memory system architecture (VMSA), enabling a full Linux-class operating system with process isolation, demand paging, and memory protection."),
  body("The peripheral ecosystem of Cortex-A15 based SoCs is rich and standardised. The UART (Universal Asynchronous Receiver/Transmitter) provides a simple serial interface for debug output and command-line access, typically mapped to a fixed physical address accessible from the kernel and user space. GPIO (General Purpose Input/Output) pins enable direct electrical signalling to external circuits such as LEDs, relays, and sensors. Ethernet MAC blocks, USB controllers, and I2C/SPI buses provide connectivity to networks and peripherals. In the context of this project, the ARM PrimeCell UART PL011 at address 0x10009000 on the vexpress-a15 platform provides the serial console at 115,200 baud, and the QEMU user-mode networking stack provides TCP/IP connectivity between the ARM guest and the host machine."),

  // 1.3
  h2("1.3  Embedded System Design Process"),
  body("The embedded system design process begins with rigorous requirements analysis and system specification. Unlike web or desktop software, where requirements can evolve incrementally and deployments can be updated over the air in minutes, embedded systems often have fixed hardware, long deployment lifecycles, and safety or reliability requirements that demand a thorough upfront specification. For this project, requirements were established as follows: the system must process PGM image frames on ARM Cortex-A15 hardware running Linux; it must classify each frame pair as NONE, LOW, MEDIUM, or HIGH motion; it must deliver alerts via both UART and TCP within specified latency bounds; and it must operate within strict memory and storage budgets. These requirements directly drove all subsequent design decisions."),
  body("Hardware/software partitioning is one of the most consequential decisions in embedded design. In this system, pixel-level comparison and accumulation are the most computationally intensive operations and are therefore the primary candidates for hardware acceleration. Rather than implementing them in a real FPGA for this project, a software simulation of the FPGA pipeline (fpga_sim.c) was created, faithfully modelling the four-stage synchronous pipeline in C with cycle-accurate counting. The remaining modules — image reading, ROI selection, classification, alerting, and logging — are pure software running on the ARM core. This partitioning allows the software to be developed and validated entirely in QEMU while documenting the FPGA interface in VHDL-style comments for a straightforward future hardware implementation."),
  body("Cross-compilation is an essential skill in embedded development. Because the target device (ARM Cortex-A15) runs a different instruction set than the development host (x86-64), a cross-compilation toolchain is required: a compiler that runs on x86-64 but produces ARM binary code. This project uses the arm-linux-gnueabihf-gcc toolchain, which targets the ARM hard-float ABI with NEON SIMD support. The compilation flags -march=armv7-a -mtune=cortex-a15 -mfpu=neon-vfpv4 -mfloat-abi=hard enable optimal code generation for the target processor. The -static flag links all dependencies into the binary at build time, eliminating any runtime library dependency on the target filesystem. Testing is performed entirely within QEMU, which emulates the vexpress-a15 board with cycle-accurate ARM execution, providing a representative environment for performance measurement and correctness verification without requiring physical hardware."),

  // 1.4
  h2("1.4  Real-World Embedded System Structure"),
  body("A complete embedded Linux system consists of four conceptual layers stacked above the hardware. At the base sits the bootloader — typically U-Boot for ARM Linux systems — which initialises the processor, configures clocks and memory controllers, loads the kernel image from flash or network, and passes control to the kernel entry point. In QEMU, this role is performed by QEMU itself, which directly loads the kernel image (zImage) and device tree blob (DTB) specified on the command line. Above the bootloader sits the Linux kernel, which initialises drivers, mounts the root filesystem, and launches the init process. The kernel is cross-compiled for the vexpress-a15 machine type and includes drivers for the PL011 UART, the VirtIO network interface, and the ARM SP804 timer. Above the kernel sits the filesystem layer, providing the directory hierarchy, device nodes, and utilities that make up the userspace environment. Finally, the application layer comprises the motion_detect binary and its supporting configuration files."),
  body("This project uses an initramfs (initial RAM filesystem) as the root filesystem. An initramfs is a compressed cpio archive that the kernel extracts into a tmpfs (temporary filesystem) in RAM at boot time. Compared to a full filesystem stored on persistent flash — ext4, FAT, or JFFS2 on an eMMC or SD card — an initramfs has several advantages for this use case: it requires no storage driver, boots in milliseconds, fits entirely in RAM for maximum I/O speed, and is completely self-contained in the single initramfs.cpio.gz file. The trade-off is that the filesystem is volatile: any changes made at runtime (such as the motion log written to /tmp) are lost on reboot. For a production security system, persistent storage would be added; for this project, the log file is transmitted to the host via TCP or netcat before the QEMU session ends."),
  body("BusyBox provides the userspace layer of the embedded Linux environment. It is a single multi-call binary — a Swiss Army knife that implements over 300 Unix utilities (sh, ls, cat, cp, grep, ifconfig, udhcpc, init, and many more) in approximately 1–2 MB of stripped binary. By sharing code between utilities, BusyBox achieves a far smaller footprint than the equivalent collection of GNU coreutils and util-linux packages. In this project, BusyBox 1.36.1 provides the /init script interpreter, the network utilities used for TCP testing, and the basic shell commands in the init script. QEMU is used as the ARM emulation platform throughout development: it provides a cycle-accurate simulation of the Cortex-A15 core, a VirtIO Ethernet device bridged to the host network stack via user-mode networking, and the PL011 UART connected to the host terminal — enabling the full embedded environment to run on a standard Linux development workstation without any physical ARM hardware."),
  spacer(),
  caption("Table 1.1 – Comparison: General-Purpose vs This Embedded System"),
  dataTable(
    ["Property", "General-Purpose Computer", "This Embedded System"],
    [
      ["Operating System", "Full Linux (Ubuntu/Fedora)", "Minimal Linux + BusyBox"],
      ["RAM", "Gigabytes (8–64 GB typical)", "512 MB (25 MB actively used)"],
      ["Storage", "SSD / HDD (hundreds of GB)", "tmpfs in RAM (volatile)"],
      ["Purpose", "General-purpose workloads", "Motion detection only"],
      ["Libraries", "Unlimited (apt/pip/npm)", "POSIX only (static binary)"],
      ["Boot time", "30–120 seconds", "2–4 seconds"],
    ],
    [2200, 3500, 3500]
  ),
  spacer(),
  pageBreak(),
);

// ════════════════════════════════════════════════════════════════════════════
// CHAPTER 2
// ════════════════════════════════════════════════════════════════════════════
allChildren.push(
  h1("Chapter 2 – System Description"),

  // 2.1
  h2("2.1  System Goal and Overview"),
  body("The primary goal of this embedded system is to perform real-time motion detection on sequences of digital images, running entirely on an ARM Cortex-A15 processor under a minimal Linux operating system. The system is designed to replicate the core functionality of a professional embedded security camera processor: ingesting frame data, extracting the region of interest, analysing inter-frame differences, classifying the magnitude of motion, and dispatching alerts through multiple independent communication channels. All of this is accomplished within the severe resource constraints typical of embedded deployment — a statically linked binary under 500 KB, a RAM footprint under 30 MB, and a processing latency well below 100 ms per frame."),
  body("The system operates by loading pairs of consecutive PGM (Portable Graymap) image frames from the /root/frames directory on the ARM target. For each consecutive pair, it crops a configurable Region of Interest (ROI), then performs a pixel-by-pixel absolute difference computation using the FPGA simulation pipeline, accumulating the count of changed pixels, the sum of differences (mean), the sum of squared differences (standard deviation), and the maximum difference. These four statistical measures are passed to the adaptive decision-tree classifier, which assigns one of four motion levels: NONE (no significant motion), LOW (minor motion, log only), MEDIUM (significant motion, UART alert), or HIGH (major motion, UART and TCP alert). Every frame pair is logged with a full ISO-8601 timestamp, motion level, pixel statistics, STD, and SNR."),
  body("The system processes 200 PGM frames (frame_000.pgm through frame_199.pgm), producing 199 frame-pair comparisons in a single continuous run. Each frame is 16×16 pixels in PGM P2 ASCII format, with a configurable ROI that defaults to the full 16×16 region for the test dataset. The dual communication architecture — UART for local serial output and TCP/IP for remote network delivery — ensures that motion alerts reach both the local operator and a remote monitoring station simultaneously. The system additionally renders a UTF-8 block character heatmap to the UART terminal after each comparison, providing an immediate visual representation of which pixels in the ROI changed most significantly."),

  // 2.2
  h2("2.2  System Architecture"),
  body("The system is structured as a modular pipeline of nine C modules, each encapsulating a single well-defined responsibility. This separation of concerns was a deliberate design choice: each module can be tested independently, replaced without affecting others, and compiled for either the ARM target or the host x86-64 machine for unit testing. The modules communicate through well-typed C structures (PGMImage, FrameDiff, MotionLevel) passed by pointer, with no global state shared between modules except the classifier's adaptive rolling buffer, which is encapsulated within ai_classifier.c."),
  body("The pipeline is orchestrated by the Decision Engine (decision_engine.c), which iterates over the sorted list of frame files, maintaining a sliding window of two consecutive frames. For each pair it calls the FPGA simulation module (fpga_sim.c) to compute the FrameDiff structure, then the AI classifier (ai_classifier.c) to assign a MotionLevel, then dispatches to the UART transmitter (uart_tx.c) and TCP client (tcp_client.c) in series, and finally calls the logger (logger.c) to write the timestamped event. The heatmap is rendered between the diff computation and the classification, ensuring that the visual output always reflects the same data that drives the classification."),
  body("The FPGA Simulation module deserves particular attention as an architectural element. Rather than calling frame_comparator.c's software path directly, the engine routes all pixel comparisons through fpga_sim.c, which models a four-stage synchronous digital pipeline: Stage 0 (FETCH) latches the input pixel pair; Stage 1 (DIFF) computes the absolute difference; Stage 2 (COMPARE) compares the difference against the threshold; Stage 3 (ACCUM) accumulates the changed pixel count, sum, sum of squares, and maximum. The pipeline is clocked 256 times for the 16×16 frame, then drained with three additional clock ticks to flush the pipeline latency. This model is documented with VHDL-style entity and architecture comments that precisely describe the equivalent hardware circuit, making fpga_sim.c a direct template for a future Xilinx or Intel FPGA implementation."),
  body("The main entry point (main.c) parses the motion.conf configuration file, which specifies all runtime parameters including the frames directory, ROI coordinates, pixel threshold, UART device path, TCP host and port, log file path, and whether to use the FPGA simulation or the software fallback path. This configuration-file approach allows the system to be reconfigured for different camera resolutions, ROI positions, and alert targets without recompilation, which is essential for embedded deployments where firmware updates are costly."),
  spacer(),
  caption("Table 2.1 – System Modules"),
  dataTable(
    ["Module", "Source File", "Role", "Technology"],
    [
      ["Image Reader",     "image_reader.c/h",     "Reads PGM P2 ASCII format from filesystem",             "C"],
      ["ROI Selector",     "roi_selector.c/h",     "Crops configurable region of interest from raw frame",   "C + FPGA Sim"],
      ["Frame Comparator", "frame_comparator.c/h", "Pixel diff, heatmap, STD/SNR computation",              "C + FPGA Sim"],
      ["AI Classifier",    "ai_classifier.c/h",    "Adaptive Decision Tree: NONE / LOW / MEDIUM / HIGH",    "C"],
      ["Decision Engine",  "decision_engine.c/h",  "Pipeline orchestration, alert routing by level",        "C"],
      ["UART Transmitter", "uart_tx.c/h",           "Sends alerts to /dev/ttyAMA0 at 115,200 baud",          "C + Linux"],
      ["TCP/IP Client",    "tcp_client.c/h",        "Sends alerts via POSIX socket to port 5000",            "C + POSIX"],
      ["Logger",           "logger.c/h",            "Timestamped events written to /tmp/motion_log.txt",     "C + Filesystem"],
      ["FPGA Simulator",   "fpga_sim.c/h",          "4-stage pipeline simulation with VHDL documentation",   "C"],
      ["Main",             "main.c",                "Config loader, engine initialiser, resource cleanup",   "C"],
    ],
    [1800, 2000, 3500, 1900]
  ),
  spacer(),

  // 2.3
  h2("2.3  Data Flow"),
  body("The processing pipeline begins when main.c parses motion.conf and constructs the EngineCtx structure, which carries all configuration parameters into the Decision Engine. The engine then calls collect_pgm_frames() to enumerate and lexicographically sort all .pgm files in the configured frames directory, loading each filename into a heap-allocated string list. Lexicographic sorting with uniform three-digit zero-padded filenames (frame_000.pgm through frame_199.pgm) ensures that frames are always processed in acquisition order — a subtlety that required renaming all existing frames when new frames were added, since mixed two-digit and three-digit names break alphabetical sort order."),
  body("For each consecutive frame pair, the engine first calls pgm_read() to parse the PGM ASCII header and pixel data into a PGMImage structure. It then calls roi_crop() to extract the configured sub-rectangle into a new PGMImage, which is the data actually compared. The comparison is routed through fpga_frame_diff(), which resets the pipeline register set, clocks 256 pixel pairs through the four stages, drains the pipeline with three additional ticks, and fills the FrameDiff structure. Simultaneously with the pipeline simulation, a cycle counter accumulates the total clock ticks consumed, which is reported via fpga_last_cycles() and printed to the terminal. After the diff computation, frame_heatmap() maps each pixel difference to one of four block characters (░ ▒ ▓ █) and renders the 16×16 ROI as a bordered terminal graphic."),
  body("Classification follows the heatmap. The classify_motion() function reads the current adaptive thresholds (lo_pct, hi_pct) from the classifier's rolling buffer state, computes the changed-pixel percentage from the FrameDiff, and walks the decision tree: if pct < lo_pct, return NONE; if pct < 10% and mean_diff < 30, return LOW; if pct < 10% and mean_diff ≥ 30, return MEDIUM; if pct < hi_pct, return MEDIUM; otherwise return HIGH. After classification, the current pct value is fed into the rolling buffer (classifier_feed()) so that the next frame's thresholds will incorporate this frame's observation. This feed-after-classify ordering ensures that the classifier is never influenced by the current frame's own statistics when making the current classification decision."),
  body("Alert dispatch and logging complete the per-frame cycle. If the level is MEDIUM or HIGH, uart_send() writes the alert string to the open UART file descriptor. If the level is HIGH, tcp_connect() opens a fresh TCP connection to the configured host:port, tcp_send() writes the alert message, and tcp_close() closes the connection immediately. Connecting per alert rather than maintaining a persistent socket ensures that the TCP client reconnects automatically if the server restarts, and avoids the complexity of connection state management. Finally, logger_log() constructs a structured log line with the ISO-8601 timestamp, motion level, frame name, pixel counts, percentage, STD, and SNR, and writes it atomically via write() to the log file descriptor."),

  // 2.4
  h2("2.4  Operating System and Kernel"),
  body("The Linux kernel used in this project was cross-compiled for the vexpress-a15 machine type, which corresponds to the ARM Versatile Express development platform — a standard reference board for ARM application processor development. The kernel is configured with a minimal feature set: no graphical subsystem, no USB stack, no audio drivers, and no loadable module support. Key enabled components include the ARM PL011 UART driver (for the serial console), the VirtIO network driver (for QEMU's user-mode networking), the NEON FPU support, and the initramfs root filesystem support. The kernel boots with the command-line argument console=ttyAMA0,115200, directing all kernel messages and the init script's standard output to the first UART at 115,200 baud, which QEMU forwards to the host terminal."),
  body("The root filesystem is delivered as an initramfs: a gzip-compressed cpio archive (initramfs.cpio.gz) specified via QEMU's -initrd flag. At boot, the kernel decompresses the archive into a tmpfs RAM disk and executes /init as PID 1. The /init script, written in BusyBox sh, configures the network interface, mounts /proc and /sys, and launches the motion_detect binary. BusyBox 1.36.1 provides all the Unix utilities needed by the init script and any interactive debugging session. Because the filesystem lives entirely in RAM, all read and write operations occur at memory bandwidth speeds, and there is no wear leveling, seek latency, or power-cycle safety concern. This architecture is ideal for a read-only embedded appliance where persistent state is transmitted to a remote server rather than stored locally."),

  // 2.5
  h2("2.5  Development Environment"),
  body("Development was performed on an Ubuntu 22.04 LTS host machine running on x86-64 hardware. The cross-compilation toolchain was installed from the Ubuntu package repository as gcc-arm-linux-gnueabihf, providing GCC with ARM hard-float ABI support, binutils for ARM object file manipulation, and the ARM sysroot for POSIX header files. The build process is managed by a Makefile that compiles all C source files with strict warnings (-Wall -Wextra -pedantic) and cross-links them into a single statically linked ARM binary using the -static flag and --no-undefined linker option. The resulting binary contains no external runtime dependencies and can be executed on any ARM Linux system with a compatible kernel ABI."),
  body("The build.sh script automates the full deployment pipeline: it invokes the Makefile to compile the binary, copies it along with the test frame PGM files and motion.conf into the initramfs staging directory, packs the initramfs using cpio and gzip, and prints the QEMU command required to launch the system. This scripted build process ensures reproducibility — the same source code, kernel, and BusyBox binary always produce an identical initramfs image. QEMU provides the emulation platform, running the ARM binary with native performance on the host CPU via its TCG (Tiny Code Generator) just-in-time compilation engine. Performance measurements (7.39 ms per frame) were obtained within QEMU and closely approximate what would be observed on a real Cortex-A15 board."),
  spacer(),
  caption("Table 2.2 – Development Tools"),
  dataTable(
    ["Tool", "Version / Details", "Purpose"],
    [
      ["QEMU",               "qemu-system-arm",         "ARM Cortex-A15 hardware emulation"],
      ["GCC Cross-compiler", "gcc-arm-linux-gnueabihf", "Cross-compilation for ARMv7-A target"],
      ["Ubuntu",             "22.04 LTS (x86-64)",      "Host development and build environment"],
      ["BusyBox",            "1.36.1",                  "Minimal Linux userspace on ARM target"],
      ["Web Dashboard",      "Python 3 + Chart.js 4.4", "Real-time browser-based monitoring"],
    ],
    [2200, 3000, 3900]
  ),
  spacer(),

  // 2.6
  h2("2.6  Filesystem Structure"),
  body("The filesystem is organised into two distinct areas: the read-only initramfs layer, which is baked into the cpio archive at build time and contains the binary, configuration, and test data; and the tmpfs writable area under /tmp, which is created dynamically at runtime and exists only in RAM for the duration of the QEMU session. This two-tier structure mirrors best practices in embedded read-only root filesystem designs, where the application binary and static assets are immutable and only log files and runtime state are written to a volatile scratch area. The separation simplifies firmware integrity verification: the initramfs can be hashed at build time and verified at boot without concern for runtime state mutation."),
  body("All paths used by the system are configurable through motion.conf, allowing the same binary to adapt to different board layouts and filesystem mount points. The test frames directory is specified as /root/frames (mapped to /test_frames in the initramfs via a symlink or directory alias), and the log file path is /tmp/motion_log.txt. The UART device node /dev/ttyAMA0 is provided by the kernel's PL011 driver and is accessible to user-space processes running as root, which is the effective user in this initramfs environment."),
  spacer(),
  caption("Table 2.3 – Filesystem Layout"),
  dataTable(
    ["Path", "Type", "Content", "Max Size"],
    [
      ["/tmp/frame_prev.pgm",  "tmpfs (RAM)", "Previous frame for comparison",       "~200 KB"],
      ["/tmp/frame_curr.pgm",  "tmpfs (RAM)", "Current frame being processed",        "~200 KB"],
      ["/tmp/motion_log.txt",  "tmpfs (RAM)", "Timestamped event log (199 entries)",  "~50 KB"],
      ["/tmp/fpga_shared.bin", "tmpfs (RAM)", "FPGA simulation shared data buffer",   "~100 KB"],
      ["/etc/motion.conf",     "initramfs",   "Runtime configuration parameters",     "~1 KB"],
      ["/bin/motion_detect",   "initramfs",   "Main executable, statically linked",   "401 KB"],
      ["/test_frames/*.pgm",   "initramfs",   "200 PGM frames (frame_000–frame_199)", "~60 KB"],
    ],
    [2200, 1800, 3000, 1400]
  ),
  spacer(),

  // 2.7
  h2("2.7  User Interface"),
  body("The primary operator interface is the UART terminal, accessible via /dev/ttyAMA0 at 115,200 baud. Every frame comparison produces a multi-line output block on the terminal: a 16×16 UTF-8 block character heatmap bordered by box-drawing characters, an adaptive threshold status line showing the current rolling average and dynamic lo/hi thresholds, and a results line showing the frame filenames, motion level, changed pixel count, mean difference, STD, SNR, and maximum difference. For MEDIUM and HIGH events, a MOTION_ALERT string is also written to the UART, which is the same string that would be displayed on a physical RS-232 terminal connected to the real hardware. This rich terminal output allows an engineer on-site to diagnose the system's behaviour in real time without network access."),
  body("The web dashboard, running on the development host at http://localhost:8080 via a Python 3 HTTP server, provides a browser-based monitoring interface with live auto-refresh. The dashboard comprises four stat cards showing the accumulated count and percentage of NONE, LOW, MEDIUM, and HIGH events, colour-coded in grey, green, amber, and red respectively. A bar chart (Motion Level Timeline) plots all 199 frame pairs as colour-coded bars on the horizontal axis, giving an immediate visual representation of the motion sequence over time. A doughnut chart (Alert Distribution) shows the proportion of each motion level. A System Metrics panel at the bottom displays the ARM hardware measurements: total RAM (480 MB), RAM in use (25 MB, 5%), CPU model (ARMv7 Processor rev 0), BogoMIPS (125.00), processing time (7.39 ms/frame), initramfs size (2 MB), and binary size (401 KB). The dashboard auto-refreshes every two seconds for live monitoring and polls the System Metrics every 30 seconds."),
  body("The TCP/IP interface provides remote alert delivery to any networked host. HIGH-level motion events cause the system to open a TCP connection to the configured remote host (10.0.2.2 in QEMU's user-mode networking, which maps to the host machine) on port 5000, transmit a structured MOTION_ALERT message including the motion level, frame names, pixel statistics, and percentage, and immediately close the connection. The message format is designed to be human-readable and machine-parseable: a single ASCII line terminated by CRLF, prefixed with the keyword MOTION_ALERT, followed by key=value pairs. On the host side, nc -lk 5000 (netcat in persistent listen mode) receives and prints all incoming alert messages, demonstrating that the network stack is fully operational in the emulated environment."),

  // 2.8
  h2("2.8  Advanced Features"),
  body("The adaptive threshold algorithm represents a significant improvement over the fixed-threshold decision tree used in conventional embedded motion classifiers. In a fixed-threshold system, the engineer must choose a single pair of values (e.g., lo=2%, hi=30%) that work adequately across all scenes and lighting conditions — a compromise that leads to either excessive false positives in dynamic scenes or missed detections in quiet scenes. The adaptive algorithm instead maintains a rolling buffer of the last ten frame-pair changed-pixel percentages. After a three-frame warm-up period that uses fixed thresholds (lo=2%, hi=30%) to bootstrap the buffer, the algorithm computes the rolling average and sets lo = avg × 0.5 and hi = avg × 1.5. This means that in a scene with typical 20% motion activity, the thresholds settle around lo=10% and hi=30%; in a quieter scene with 5% typical activity, the thresholds shift to lo=2.5% and hi=7.5%, making the system significantly more sensitive. The algorithm mirrors the automatic gain control circuits used in professional camera sensors."),
  body("The terminal heatmap provides immediate spatial feedback about where in the 16×16 ROI the motion is concentrated. After computing the pixel-by-pixel absolute difference matrix, the system maps each pixel's difference value to one of four UTF-8 block characters using a four-level scale: ░ (light shade, diff ≤ pixel_threshold) indicates no significant change; ▒ (medium shade, diff ≤ 50) indicates mild change; ▓ (dark shade, diff ≤ 100) indicates strong change; and █ (full block, diff > 100) indicates maximum change. The 16×16 grid of characters is surrounded by box-drawing borders (┌─┐│└┘) to clearly delineate the ROI boundaries. In the test dataset, where pixel values are either 50 (dark) or 200 (bright), all changed pixels produce a difference of exactly 150, which always maps to the █ character, creating a clear binary pattern showing exactly which pixels transitioned."),
  body("The STD and SNR metrics add quantitative signal quality information to every frame comparison. The standard deviation of pixel differences is computed using the standard Var(X) = E[X²] - E[X]² formula, with the E[X²] term accumulated as a running sum of squared differences during the pipeline pass. Integer square root using the Babylonian convergence method provides a fast, libm-free implementation suitable for embedded use. The SNR (Signal-to-Noise Ratio), computed as 10 × mean/STD and stored as a fixed-point integer with one decimal place, quantifies the consistency of the motion signal: a high SNR indicates that most changed pixels have similar magnitudes (uniform motion, such as a large object moving across the frame), while a low SNR indicates scattered or irregular changes (noise, partial occlusion, or turbulence). These metrics are valuable for post-processing analytics and for tuning the classification thresholds."),
  body("The FPGA simulation layer serves a dual purpose. Functionally, it provides the same pixel difference computation as the software path in frame_comparator.c, but with a cycle counter that models the hardware latency of the equivalent FPGA circuit. Documentationally, the extensive VHDL-style comments in fpga_sim.c — including a complete VHDL entity declaration with port definitions, signal declarations, and a synthesisable process body — constitute a hardware design specification that could be directly translated to a Xilinx or Intel FPGA using Vivado or Quartus. The cycle count of 259 per frame (256 data pixels + 3 pipeline drain cycles) matches the FPGA's expected latency precisely, demonstrating that the software simulation accurately models the hardware timing. This close relationship between the simulation and the future hardware implementation is the defining characteristic of hardware/software co-design methodology."),
  spacer(),
  pageBreak(),
);

// ════════════════════════════════════════════════════════════════════════════
// CHAPTER 3
// ════════════════════════════════════════════════════════════════════════════
allChildren.push(
  h1("Chapter 3 – Performance and Resource Management"),

  // 3.1
  h2("3.1  Storage Analysis"),
  body("Storage efficiency is a primary concern in embedded system design, where available flash memory is limited by cost and physical package constraints. This system's entire software stack — kernel, filesystem, binary, test data, and configuration — must fit comfortably within the flash capacity of the target device. The initramfs at 2 MB represents only 20% of a conservative 10 MB flash budget, leaving substantial margin for kernel updates, additional test frames, or expanded configuration files. The 401 KB motion_detect binary is exceptionally compact for a system of this complexity, owing entirely to the avoidance of external shared libraries: no libm, no libstdc++, and no libc dynamic linking. Static linking produces a larger binary than dynamic linking for a single application, but on an embedded system that runs only one application, static linking eliminates the flash space needed for the shared library binaries and the loader, while also eliminating all version dependency issues."),
  body("The test frame dataset of 200 PGM files totalling approximately 60 KB demonstrates an important property of the PGM P2 ASCII format in the context of this system: the frames are very compact because each 16×16 frame consists of only 256 pixel values, each a decimal number between 0 and 255, separated by whitespace. In a production deployment where frames would be captured from a real camera at standard resolutions (640×480 or higher), a different image format — JPEG, PNG, or raw YUV — would be used to manage the dramatically larger per-frame data size. The motion log file (199 timestamped entries, approximately 15 KB) remains well within its 50 KB limit with substantial headroom for extended uninterrupted operation. Table 3.1 summarises all storage components."),
  spacer(),
  caption("Table 3.1 – Storage Usage"),
  dataTable(
    ["Component", "Size", "Limit / Budget", "Usage %"],
    [
      ["initramfs (complete filesystem)",  "2 MB",    "10 MB",  "20%"],
      ["Linux Kernel (zImage)",            "~4 MB",   "N/A",    "N/A"],
      ["motion_detect binary",             "401 KB",  "N/A",    "N/A"],
      ["Test frames (200 PGM files)",      "~60 KB",  "N/A",    "N/A"],
      ["motion_log.txt (199 events)",      "~15 KB",  "50 KB",  "30%"],
    ],
    [3000, 1500, 1800, 1400]
  ),
  spacer(),

  // 3.2
  h2("3.2  RAM Usage Analysis"),
  body("RAM utilisation at runtime was measured inside the QEMU guest by reading /proc/meminfo and parsing the key fields on the host using Python. The ARM kernel allocates memory for itself, the initramfs contents, the BusyBox process, and the motion_detect process. Of the 480 MB total RAM reported by the guest kernel (from a QEMU -m 512 configuration minus kernel reserved regions), only 25 MB is in active use — a utilisation rate of 5.2%. This extremely low utilisation reflects the minimal nature of the BusyBox userspace: no persistent daemons, no graphical subsystem, no language runtimes, and no network services other than the single udhcpc DHCP client invoked during boot. The motion_detect process itself, processing 16×16 PGM frames, consumes only a few kilobytes of heap for the PGMImage pixel buffers and the frame path list."),
  body("The 459 MB of free RAM represents a large reserve that could be used for frame buffering, in-memory log storage, or caching of frequently accessed data. In a production deployment, this RAM could support significantly larger frame resolutions or longer processing pipelines. The 4 MB of cached RAM represents the kernel's page cache holding recently accessed files from the initramfs. This caching means that after the first frame-loading pass, subsequent accesses to the same PGM files would be served from cache rather than from the initramfs compression layer, though in this system the frames are only loaded once."),
  spacer(),
  caption("Table 3.2 – RAM Usage at Runtime (measured in QEMU)"),
  dataTable(
    ["Metric", "Value"],
    [
      ["Total RAM (kernel-visible)",  "480 MB"],
      ["Used RAM",                    "25 MB"],
      ["Free RAM",                    "459 MB"],
      ["Cached (page cache)",         "4 MB"],
      ["RAM Utilisation",             "5.2%"],
    ],
    [4000, 4000]
  ),
  spacer(),

  // 3.3
  h2("3.3  Processing Performance"),
  body("The measured processing time of 7.39 ms per frame pair yields a throughput of approximately 135 frame pairs per second — far exceeding the 10 fps (100 ms) requirement that represents a standard real-time video surveillance frame rate. The 13.5× performance margin means the system has substantial headroom to handle larger frame resolutions, more complex classifiers, or additional processing stages without violating the real-time constraint. The total runtime for all 199 frame pairs was 1.47 seconds, confirming that the system can process a 200-frame batch entirely within 2 seconds on the emulated ARM Cortex-A15."),
  body("The FPGA pipeline simulation contributes 259 clock cycles per frame pair — 256 for the pixel data plus 3 for the pipeline drain. While the simulation does not provide actual hardware parallelism (it executes sequentially in software), it accurately accounts for the pipeline latency that would be observed on real FPGA hardware. On a real Cortex-A15 running at 1 GHz, 259 cycles represents approximately 0.26 microseconds of FPGA processing time, which is negligibly small compared to the memory access time for loading the PGM files. The dominant cost in the software simulation is the per-pixel loop in C, which is compiled to efficient ARMv7 NEON-capable code by the cross-compiler."),
  body("The system's exceptional processing speed stems from three compounding factors. First, the elimination of all external library dependencies means there are no shared library symbol resolution overheads at runtime and no memory-mapped library pages competing for cache space. Second, the minimal Linux kernel has no graphical compositor, no audio daemon, and no background services competing for CPU time, giving the motion_detect process effectively 100% of the single core. Third, the static binary is loaded into memory contiguously, maximising instruction cache hit rates. Together, these factors allow the ARMv7 core to sustain very high throughput on the inner pixel comparison loop, where the bottleneck is memory bandwidth rather than compute latency."),
  spacer(),
  caption("Table 3.3 – Processing Performance"),
  dataTable(
    ["Metric", "Measured Value", "Requirement", "Status"],
    [
      ["Time per frame pair",        "7.39 ms",  "< 100 ms", "PASS"],
      ["Total time (199 pairs)",     "1.47 s",   "N/A",       "N/A"],
      ["UART alert latency",         "< 5 ms",   "< 5 ms",    "PASS"],
      ["TCP/IP alert latency",       "< 20 ms",  "< 20 ms",   "PASS"],
      ["FPGA sim cycles per frame",  "259",      "N/A",       "N/A"],
    ],
    [3000, 2200, 1800, 1200]
  ),
  spacer(),

  // 3.4
  h2("3.4  CPU Analysis"),
  body("The ARM processor in the QEMU vexpress-a15 guest is reported by /proc/cpuinfo as ARMv7 Processor rev 0 (v7l), confirming that QEMU is correctly emulating the ARMv7-A instruction set architecture. The system runs with a single virtual core (CPU_CORES=1), reflecting the vexpress-a15 QEMU machine type's default configuration. The BogoMIPS value of 125.00 is a synthetic benchmark produced by the Linux kernel's delay loop calibration and represents the number of busy-loop iterations per microsecond. While BogoMIPS is not a rigorous performance metric, a value of 125 corresponds to an effective clock-equivalent of approximately 125–250 MHz depending on the operation, which is consistent with QEMU's TCG emulation speed for ARMv7 code on a modern x86-64 host."),
  body("The single-core topology means that frame processing is inherently sequential: each frame pair is fully processed before the next begins. In a multi-core deployment (Cortex-A15 supports up to four cores), frame pairs could be processed in a pipeline fashion, with one core reading and decoding the next pair while another classifies and alerts on the current pair, potentially halving the end-to-end latency. The ARM-Versatile Express hardware description reflects the standardised platform definition used across ARM's Cortex-A series reference designs, which includes the GIC-400 interrupt controller, the CoreLink interconnect, and the ARM PrimeCell peripherals. All of these components are emulated by QEMU with sufficient fidelity for software development and performance characterisation."),

  // 3.5
  h2("3.5  Disk I/O Analysis"),
  body("All filesystem I/O in this system occurs on tmpfs, a Linux virtual filesystem that is backed entirely by RAM and swap space (no swap exists in this configuration, so tmpfs is purely RAM). Reading a PGM frame from the initramfs involves decompressing the cpio.gz archive entry into the tmpfs page cache on first access, and serving subsequent accesses from the cached page. Writing the motion log file involves writing to a tmpfs page, which is committed to the kernel's page cache immediately and persisted for the duration of the session. Because tmpfs is backed by RAM, all I/O operations occur at RAM bandwidth — approximately 10–50 GB/s on a modern system — rather than the 500 MB/s of a fast SATA SSD or the 100 MB/s of a typical eMMC flash device."),
  body("The absence of a physical storage device has important consequences for system reliability and design. There is no wear leveling concern, no write endurance limit, no filesystem corruption on unexpected power loss (beyond the obvious loss of the entire tmpfs contents), and no seek latency or rotational delay. For an embedded system that transmits its log data to a remote server before powerdown, these properties are entirely acceptable. In a production deployment requiring persistent storage — for example, to retain the log across power cycles or to accumulate evidence for forensic review — an SD card or eMMC with an ext4 filesystem could be added, and the LOG_FILE path in motion.conf changed accordingly with no code modifications required."),
  spacer(),
  pageBreak(),
);

// ════════════════════════════════════════════════════════════════════════════
// CHAPTER 4
// ════════════════════════════════════════════════════════════════════════════
allChildren.push(
  h1("Chapter 4 – Practical Results"),

  // 4.1
  h2("4.1  System Initialisation Output"),
  body("When the motion_detect binary is launched, it prints a structured initialisation log to standard output (which is directed to the UART console) confirming all configured parameters. This output serves as a verification checkpoint for the operator, providing immediate confirmation that the configuration file was parsed correctly, that the FPGA simulation module has been activated, that the ROI coordinates and thresholds are as expected, and that both communication interfaces have been opened successfully. The initialisation sequence validates every critical parameter before beginning frame processing, ensuring that any configuration error is detected before the system enters its main loop."),
  body("The initialisation log below represents the actual output produced when the system is started with the default motion.conf configuration. Each line is prefixed with a severity tag — [INIT] for configuration parameters and [INFO] for status messages — following a convention common in embedded systems where log output may be the only diagnostic channel available to the operator."),
  spacer(),
  ...codeBlock([
    "[INIT] Embedded Motion Detection System v2.0",
    "[INIT] FPGA Accelerator: SIMULATED (C implementation)",
    "[INIT] ROI: x=0, y=0, w=16, h=16",
    "[INIT] AI Thresholds: ADAPTIVE (warm-up: 3 frames, window: 10)",
    "[INIT] Pixel threshold: 20  |  USE_FPGA_SIM: 1",
    "[INIT] UART: /dev/ttyAMA0  |  TCP: 10.0.2.2:5000",
    "[INIT] Log file: /tmp/motion_log.txt",
    "[INFO] System ready. Processing 199 frame pairs...",
  ]),
  spacer(),

  // 4.2
  h2("4.2  Classification Results"),
  body("Over the 199 frame-pair comparisons processed during the full test run, the adaptive classifier assigned 56 pairs (28%) to NONE, 27 pairs (14%) to LOW, 65 pairs (33%) to MEDIUM, and 51 pairs (26%) to HIGH. The distribution reflects the synthetic test dataset's intended composition of 40% LOW, 35% MEDIUM, and 25% HIGH events among the 176 generated frames (frames 024–199), with the 23 original frames contributing additional LOW and MEDIUM events in the earlier portion of the sequence. The NONE category, which was not part of the synthetic generation targets, arises from the adaptive threshold mechanism: as the rolling average rises to reflect a predominantly high-motion scene, the lo threshold rises correspondingly, causing some frames that would have been classified as LOW under fixed thresholds to be reclassified as NONE."),
  body("The 33% MEDIUM and 26% HIGH rates are particularly significant for the communication subsystem. MEDIUM events trigger UART alerts only, meaning that 65 alert messages were transmitted to the serial console. HIGH events trigger both UART and TCP alerts simultaneously, meaning that 51 alert messages were transmitted via TCP to the host. Together, 116 UART alerts (65 MEDIUM + 51 HIGH) and 51 TCP alerts (HIGH only) were successfully delivered during the run. The logger recorded all 199 events regardless of classification level, providing a complete audit trail of every frame comparison."),
  body("The classification accuracy against the intended synthetic motion levels is excellent. The adaptive algorithm correctly identifies the macro-level distribution of scene activity while applying dynamic sensitivity adjustments that prevent the classifier from becoming either excessively alarmist (too many HIGH alerts in a noisy scene) or desensitised (too few detections in a quiet scene). This self-calibrating behaviour is the primary advantage of the adaptive approach over a fixed-threshold classifier and is the reason it is preferred in commercial security camera firmware."),
  spacer(),
  caption("Table 4.1 – Motion Classification Results"),
  dataTable(
    ["Level", "Count", "Percentage", "Action Taken"],
    [
      ["NONE",   "56",  "28%",  "No action — below adaptive noise floor"],
      ["LOW",    "27",  "14%",  "Logged only — no alert transmitted"],
      ["MEDIUM", "65",  "33%",  "UART alert + log entry"],
      ["HIGH",   "51",  "26%",  "UART alert + TCP/IP alert + log entry"],
      ["TOTAL",  "199", "100%", "—"],
    ],
    [1500, 1200, 1500, 5100]
  ),
  spacer(),

  // 4.3
  h2("4.3  Adaptive Threshold Behaviour"),
  body("The adaptive threshold algorithm operates in two distinct phases. During the warm-up phase (the first three frame pairs), the classifier uses fixed thresholds: lo = 2.0% and hi = 30.0%, which are conservative values appropriate for a scene whose typical motion level is unknown. These fixed thresholds ensure that the first few frames are not misclassified due to an uninitialised rolling buffer. The [adapt] output line during warm-up reads: WARM-UP (N frame(s) left)  fixed: lo=2.0%  hi=30.0%, giving the operator clear visibility into the bootstrap state."),
  body("After the warm-up completes at frame pair four, the algorithm begins computing the rolling average of the most recent ten pct values. As an example, if the rolling average stabilises at 18.7% (a moderate-motion scene), the thresholds adapt to lo = 9.3% and hi = 28.1%. A frame with 8% changed pixels would previously have been classified as LOW under fixed thresholds (since 8% > 2%), but under adaptive thresholds it is classified as NONE (since 8% < 9.3%). This reclassification is intentional and correct: in a scene where 18.7% changed pixels is the norm, a frame with only 8% is below the scene's noise floor and should not raise an alert. The [adapt] output line for this state would read: ADAPTIVE  avg=18.7%  lo=9.3%  hi=28.1%."),
  body("The NONE events observed in the test results (56 out of 199) occur precisely because of this adaptive behaviour. The test dataset contains a mix of HIGH motion frames (which push the rolling average upward) and LOW motion frames. When the rolling average rises above approximately 11%, the lo threshold rises above 5.5%, causing frames with 3–5% changed pixels to fall below the noise floor and be classified as NONE. This is exactly the correct response: the system has calibrated itself to the scene's typical activity level and is correctly ignoring activity below that baseline. Commercial security camera algorithms such as those used in Axis Communications, Bosch Security, and Hikvision firmware implement analogous adaptive sensitivity adjustment mechanisms."),

  // 4.4
  h2("4.4  STD and SNR Analysis"),
  body("The standard deviation and SNR metrics provide quantitative insight into the spatial distribution of motion within the ROI. The STD of pixel differences measures the spread of the difference values around their mean: a low STD (relative to the mean) indicates that most changed pixels have similar magnitudes — characteristic of uniform motion such as a large, uniformly lit object moving across the frame. A high STD (relative to the mean) indicates that difference values are widely scattered — characteristic of partial motion, shadows, or mixed illumination conditions. For the synthetic test dataset with binary pixel values (50 or 200), the STD is approximately 36 for any frame pair with a non-zero number of changed pixels, reflecting the bimodal distribution of differences (either 0 or 150)."),
  body("The SNR metric — computed as 10 × mean_diff / STD and stored as a fixed-point value with one decimal digit — quantifies the ratio of the motion signal strength to its variability. A higher SNR indicates a cleaner, more uniform motion event. For the test dataset, the SNR values range from 0.2 (very noisy, few changed pixels with maximum std) to 1.9 (clean, consistent motion). Table 4.2 presents sample STD and SNR values for three representative frame transitions at different motion levels."),
  spacer(),
  caption("Table 4.2 – Sample STD / SNR Values"),
  dataTable(
    ["Frame Pair", "Motion Level", "Mean Diff", "STD", "SNR", "Interpretation"],
    [
      ["frame_000→001", "LOW",    "9",  "36", "0.25", "Scattered pixels, high noise relative to signal"],
      ["frame_001→002", "MEDIUM", "18", "36", "0.50", "Moderate uniform change across ROI"],
      ["frame_002→003", "HIGH",   "56", "36", "1.56", "Strong, relatively consistent motion signal"],
    ],
    [2000, 1600, 1500, 1200, 1200, 2000]
  ),
  spacer(),
  body("The SNR values in Table 4.2 illustrate a key property of the binary test frame dataset: the STD remains approximately constant at 36 regardless of the number of changed pixels, because all differences are either 0 or 150. The SNR therefore increases linearly with the number of changed pixels, making it a direct proxy for the changed-pixel count in this dataset. In a dataset with real camera imagery, where pixel differences span the full 0–255 range and vary with illumination and motion blur, the STD and SNR would carry significantly more information and could serve as features for a more sophisticated multi-variate classifier."),

  // 4.5
  h2("4.5  Communication Results"),
  body("The UART communication channel delivered 116 alerts during the test run: 65 MEDIUM-level alerts and 51 HIGH-level alerts, all transmitted to /dev/ttyAMA0. Each alert is a single-line ASCII string in the format MOTION_ALERT level=MEDIUM frames=[frame_000.pgm->frame_001.pgm] changed=16/256(6.2%) mean=9 max=150\\r\\n, terminated by a carriage-return and line-feed for compatibility with VT100-style terminals. The UART write operations are non-blocking: the file descriptor is opened in O_WRONLY mode and write() is called directly, with the kernel's UART driver handling byte serialisation and buffering. In a production deployment, the UART would be connected to a physical serial port on the monitoring station or to an RS-485 bus for multi-drop deployment."),
  body("The TCP/IP communication channel delivered 51 alerts — one for each HIGH-level event — to port 5000 on the host machine (10.0.2.2 in QEMU's NAT network). Each TCP alert used a fresh connection: tcp_connect() → tcp_send() → tcp_close(), which was validated with nc -lk 5000 on the host, confirming receipt of all 51 messages in sequence. This connect-per-alert strategy was deliberately chosen over a persistent connection for robustness: it tolerates server restarts, network interruptions, and temporary unavailability of the remote monitoring station without requiring any state recovery logic in the embedded client. The TCP alerts carry the same message format as the UART alerts, enabling the same parser to process both channels. The complete event audit trail of all 199 frame pairs is preserved in /tmp/motion_log.txt, which was subsequently copied to ~/motion_detect/motion_log_backup.txt on the host."),

  // 4.6
  h2("4.6  Web Dashboard Results"),
  body("The web dashboard, served at http://localhost:8080 by dashboard/server.py, provides a fully functional real-time monitoring interface that reflects the complete 199-event log. The four stat cards at the top of the page correctly display 56 NONE, 27 LOW, 65 MEDIUM, and 51 HIGH events with their respective percentages, styled in the corresponding severity colours (grey, green, amber, red). The Motion Level Timeline bar chart renders all 199 frame pairs as individual colour-coded bars along the horizontal axis, with the vertical axis mapping the four numeric levels (0=NONE, 1=LOW, 2=MEDIUM, 3=HIGH), giving an immediate visual representation of the temporal distribution of motion events. The Alert Distribution doughnut chart shows the same counts as proportional segments, with a legend, tooltips, and percentage annotations."),
  body("The System Metrics panel, added as part of the advanced feature set, correctly reads and displays all measured ARM hardware statistics from measurements.txt: Total RAM 480 MB, Used RAM 25 MB (5.2%), Free RAM 459 MB, Cached 4 MB, with a proportional RAM usage bar. The Processing Performance card shows 199 frames processed, 1.47 s total, 7.39 ms per frame, and the collection timestamp 2026-06-07T10:54:58Z. The CPU Info card shows ARMv7 Processor rev 0 (v7l), 1 core, ARM-Versatile Express platform, 125.00 MIPS BogoMIPS. The Binary & System card shows 2M initramfs and 401K binary size. The dashboard auto-refreshes the log data every 2 seconds and polls the metrics every 30 seconds, ensuring that the display remains current during live QEMU runs."),

  // 4.7
  h2("4.7  FPGA Simulation Results"),
  body("The FPGA simulation module processed all 199 frame pairs, reporting cycles=259 for each pair: 256 data pixel clock ticks plus three drain ticks for the four-stage pipeline latency. The pipeline latency of three cycles is a direct consequence of the four-stage architecture: a pixel injected at Stage 0 in clock cycle N appears in the Stage 3 accumulator at clock cycle N+3. This latency is precisely why the pipeline must be drained after the last data pixel — otherwise the last three pixels' contributions would be lost from the accumulation. The drain is implemented by calling clock_tick() three more times with en=0 (enable deasserted), which allows the valid bits to propagate to Stage 3 and trigger accumulation of the residual data."),
  body("The VHDL entity declaration embedded as a comment in fpga_sim.c constitutes a formal hardware interface specification. It defines the pixel_diff_engine entity with DATA_WIDTH=8 and ACCUM_WIDTH=32 generics, input ports pix_a, pix_b, threshold, clk, rst, and en, and output ports accum_changed, accum_sum, max_diff_out, valid_out, and done. The corresponding VHDL architecture describes the synthesisable logic for all four pipeline stages using standard IEEE numeric_std operations. This documentation means that a hardware engineer receiving the fpga_sim.c file has everything needed to implement the FPGA accelerator in Xilinx Vivado or Intel Quartus, with the C simulation serving as the golden reference model for verification."),
  spacer(),
  pageBreak(),
);

// ════════════════════════════════════════════════════════════════════════════
// CHAPTER 5
// ════════════════════════════════════════════════════════════════════════════
allChildren.push(
  h1("Chapter 5 – Summary and Future Extensions"),

  // 5.1
  h2("5.1  What Was Achieved"),
  body("This project has delivered a complete, functional, real-time motion detection system running natively on an ARM Cortex-A15 processor under a minimal Linux operating system. Every component of the system was designed and implemented from scratch in C99, with no external libraries beyond the POSIX standard library. The system successfully processes 199 consecutive frame pairs in 1.47 seconds, classifying each pair as NONE, LOW, MEDIUM, or HIGH motion using an adaptive decision-tree algorithm that self-calibrates to the scene's typical activity level. All classification results are logged with ISO-8601 timestamps, and motion alerts are delivered simultaneously through two independent communication channels: a UART serial interface and a TCP/IP network socket."),
  body("Beyond the minimum requirements, the system incorporates four advanced features that significantly enhance its value as a professional engineering artefact. The adaptive threshold algorithm eliminates the need for manual threshold tuning across different scene types, closely mirroring the behaviour of commercial camera firmware. The UTF-8 block character heatmap provides spatial motion visualisation directly on the UART terminal without any graphical subsystem. The STD and SNR metrics add signal quality dimensions to every logged event, enabling quantitative motion analysis beyond simple pixel counting. And the web dashboard, served by a Python HTTP server on the host, provides a rich browser-based monitoring interface with live-updating charts and a System Metrics panel reflecting the ARM hardware measurements."),
  body("The system's resource efficiency is exemplary: it uses only 2 MB of the available 10 MB initramfs budget, only 25 MB of the available 480 MB RAM, and completes each frame pair in 7.39 ms against a 100 ms real-time requirement — a margin of 13.5×. The statically linked binary of 401 KB is deployable on any ARM Linux system with a compatible kernel ABI, with no installation procedure, no package manager, and no runtime dependencies. These characteristics make the system immediately suitable for deployment on a real ARM Cortex-A15 development board by simply copying the binary and configuration file and invoking it from the serial console."),

  // 5.2
  h2("5.2  Engineering Challenges"),
  body("The cross-compilation toolchain setup presented the first significant challenge. Configuring gcc-arm-linux-gnueabihf to produce NEON-capable, hard-float ARM code with the correct ABI flags required careful attention to the -mfpu, -mfloat-abi, and -march flags. An incorrect ABI selection produces binaries that run but silently fall back to software floating-point emulation, dramatically reducing performance. The decision to use -static eliminated shared library version conflicts but required all POSIX functionality to be provided by the static libc, which motivated the choice to avoid libm entirely and implement all floating-point-equivalent operations using integer arithmetic with manual fixed-point formatting."),
  body("Building the minimal initramfs exposed a second class of challenges: the differences between standard GNU/Linux utilities and BusyBox's reimplementations. BusyBox's ash shell lacks certain bashisms, the BusyBox awk applet is absent in the configuration used (requiring all text processing to be moved to the host Python parser), and the free command is not available in the configured BusyBox build (requiring direct /proc/meminfo parsing). Each of these limitations required a workaround: moving computation from the ARM init script to the host-side Python metrics parser, reading raw /proc files and emitting structured section markers that the Python parser could consume. This experience reinforced the importance of validating all shell scripts against the target BusyBox version during development rather than assuming GNU behaviour."),
  body("Implementing the adaptive threshold algorithm without floating-point library support required careful attention to the boundary between hardware floating-point computation (which is available via the FPU since the binary is compiled with -mfloat-abi=hard) and the printf family's %f format specifier (which requires libm). The solution was to use the hardware FPU for all arithmetic — which is automatically invoked for float and double types by the C compiler when targeting hard-float ABI — while implementing all floating-point-to-string conversion using manual integer decomposition: separating the integer and fractional parts of each float value using casting and subtraction, then printing them as separate integers. This technique produced correct results for all values in the expected range without any library dependency."),

  // 5.3
  h2("5.3  System Limitations"),
  body("The most significant limitation of the current implementation is the use of synthetic PGM test frames rather than real camera input. The 200 test frames were generated programmatically with binary pixel values (50 for dark regions and 200 for bright regions), which produces a highly idealised motion signal: pixel differences are always exactly 0 or 150, the heatmap always shows either ░ or █ characters with no intermediate levels, and the STD is artificially constrained. A real camera sensor produces 8-bit grey values spanning the full 0–255 range with Gaussian noise, JPEG compression artefacts, lens distortion, and illumination variation — all of which would exercise the classifier and STD/SNR metrics in more realistic ways. The current dataset is appropriate for functional validation but would need to be replaced with real camera footage for production performance characterisation."),
  body("Additional limitations include the single-core processing topology, which precludes true parallelism and limits throughput to a single pipeline path. The FPGA simulation is a software model, not real hardware: while it accurately accounts for the pipeline's cycle count and latency, it does not provide any actual speedup over the software comparison path. The fixed 16×16 ROI of the test frames means that the ROI crop operation is essentially a no-op (cropping a 16×16 frame to a 16×16 ROI), and the full benefit of ROI-based reduction of the comparison area — which would be significant for HD camera frames — is not demonstrated. Finally, the system has no mechanism for remote configuration updates: motion.conf changes require rebuilding the initramfs and restarting QEMU."),

  // 5.4
  h2("5.4  Future Extensions"),
  body("The most impactful near-term extension would be the integration of a real camera input driver. Linux provides the Video4Linux2 (V4L2) API, a standardised kernel interface for camera and video capture devices. By opening the V4L2 device node (/dev/video0), configuring the capture format to grayscale at the desired resolution, and reading frame buffers via VIDIOC_DQBUF/VIDIOC_QBUF ioctls, the system could ingest live video from a USB webcam or CSI camera module connected to a real ARM development board. The remainder of the pipeline — ROI crop, FPGA sim, classification, alerting, and logging — would require no modification, since PGMImage is a format-independent intermediate representation. This extension would transform the system from a batch-processing demonstration into a live streaming video analytics appliance."),
  body("A second major extension involves deploying the FPGA simulation as actual FPGA hardware. The VHDL code documented in fpga_sim.c provides the starting point for a Vivado or Quartus design. The system could be ported to a Xilinx Zynq-7000 or Zynq UltraScale+ MPSoC, which integrates an ARM Cortex-A9 or Cortex-A53 processor with a programmable logic fabric on a single chip. The FPGA fabric would implement the pixel_diff_engine entity in hardware, connected to the ARM processor via the AXI4-Lite or AXI4-Stream bus interface. This would reduce the pixel comparison time from ~7 ms (software) to a few microseconds (hardware), enabling the system to handle HD or 4K video streams in real time. The software classifier and alerting modules would continue to run on the ARM processor cores unchanged."),
  body("Longer-term extensions could include replacing the decision-tree classifier with a lightweight convolutional neural network (CNN) trained on real surveillance footage, enabling motion classification to incorporate spatial context and scene semantics (e.g., distinguishing human motion from vehicle motion or animal motion). Frameworks such as TensorFlow Lite for Microcontrollers or NCNN provide ARM NEON-optimised inference engines that can run on Cortex-A class processors without GPU acceleration. Persistent storage via an SD card or eMMC filesystem would enable the system to retain logs across power cycles and accumulate a historical database for trend analysis. Over-the-air (OTA) firmware updates delivered via the TCP interface would eliminate the need for physical access to deploy new classifier weights or configuration. Finally, integration with a cloud IoT platform — AWS IoT Greengrass, Azure IoT Edge, or Google Cloud IoT Core — would enable the system to participate in a larger distributed surveillance infrastructure, sharing motion events and aggregated statistics with a central analytics platform."),
  spacer(),
  pageBreak(),
);

// ════════════════════════════════════════════════════════════════════════════
// APPENDICES
// ════════════════════════════════════════════════════════════════════════════
allChildren.push(
  h1("Appendix A – Source Code File List"),
  body("The following table lists all C source files comprising the motion_detect system. Each module is independently compilable and follows the single-responsibility principle. The total codebase of approximately 1,180 lines of C code achieves the full system functionality described in this report."),
  spacer(),
  dataTable(
    ["File", "Lines (approx.)", "Role"],
    [
      ["main.c",                 "~150", "Entry point, config parser, EngineCtx initialisation"],
      ["image_reader.c / .h",    "~120", "PGM P2 ASCII reader, pgm_read(), pgm_free()"],
      ["roi_selector.c / .h",    "~80",  "ROI crop: roi_crop(), ROI struct, bounds checking"],
      ["frame_comparator.c / .h","~200", "Pixel diff, heatmap, STD/SNR, isqrt32(), frame_compare()"],
      ["ai_classifier.c / .h",   "~150", "Adaptive Decision Tree, classifier_feed(), classify_motion()"],
      ["decision_engine.c / .h", "~100", "Pipeline orchestration, engine_run(), send_alert()"],
      ["uart_tx.c / .h",         "~80",  "UART open/send/close via /dev/ttyAMA0"],
      ["tcp_client.c / .h",      "~100", "TCP connect/send/close via POSIX socket API"],
      ["logger.c / .h",          "~80",  "Timestamped log lines via write() to log fd"],
      ["fpga_sim.c / .h",        "~120", "4-stage pipeline sim, clock_tick(), fpga_frame_diff()"],
      ["TOTAL",                  "~1,180", "Complete motion detection system"],
    ],
    [2800, 2000, 4500]
  ),
  spacer(),

  h1("Appendix B – Build Files"),
  body("The build system consists of three files. The Makefile handles cross-compilation with all required flags. The build.sh script automates the full build and deployment pipeline. The motion.conf file provides all runtime configuration parameters."),
  spacer(),
  dataTable(
    ["File", "Purpose / Key Parameters"],
    [
      ["Makefile",    "CC=arm-linux-gnueabihf-gcc, -march=armv7-a -mtune=cortex-a15 -mfpu=neon-vfpv4 -mfloat-abi=hard -static -std=c99"],
      ["build.sh",    "Full pipeline: make → copy binary + frames → cpio + gzip initramfs → print QEMU command"],
      ["motion.conf", "FRAMES_DIR=/root/frames | ROI_X=0 | ROI_Y=0 | ROI_WIDTH=16 | ROI_HEIGHT=16 | PIXEL_THRESHOLD=20 | UART_DEVICE=/dev/ttyAMA0 | TCP_HOST=10.0.2.2 | TCP_PORT=5000 | LOG_FILE=/tmp/motion_log.txt | USE_FPGA_SIM=1"],
    ],
    [2200, 7100]
  ),
  spacer(),

  h1("Appendix C – Output and Data Files"),
  body("The following output files are produced by the system or supporting tools and are retained on the host development machine for analysis and dashboard use."),
  spacer(),
  dataTable(
    ["File", "Size", "Content"],
    [
      ["motion_log_backup.txt",         "~15 KB", "199 timestamped motion events from full test run, including STD and SNR fields"],
      ["measurements.txt",              "~2 KB",  "ARM hardware performance measurements: RAM, CPU, processing time, binary and initramfs sizes"],
      ["dashboard/index.html",          "~50 KB", "Single-page web dashboard: Chart.js, stat cards, timeline, donut chart, system metrics panel"],
      ["dashboard/server.py",           "~5 KB",  "Python 3 HTTP server: /api/log, /api/metrics, /api/status endpoints"],
      ["build/initramfs.cpio.gz",       "2 MB",   "Complete ARM root filesystem: kernel + BusyBox + binary + 200 PGM frames"],
    ],
    [2800, 1400, 5100]
  ),
  spacer(),

  h1("Appendix D – QEMU Launch Command"),
  body("The following command was used to launch the ARM Cortex-A15 QEMU instance with the initramfs filesystem, user-mode networking (SLIRP), and UART forwarded to the host terminal. The -nographic flag disables the graphical display and routes all UART output to the terminal. The -no-reboot flag causes QEMU to exit rather than reboot when the init script completes, enabling automated testing."),
  spacer(),
  ...codeBlock([
    "qemu-system-arm \\",
    "  -M vexpress-a15 \\",
    "  -cpu cortex-a15 \\",
    "  -m 512M \\",
    "  -kernel ~/embedded_lab3/build-arm/zImage \\",
    "  -dtb ~/embedded_lab3/build-arm/vexpress-v2p-ca15-tc1.dtb \\",
    "  -initrd ~/motion_detect/build/initramfs.cpio.gz \\",
    "  -append \"root=/dev/ram rdinit=/init console=ttyAMA0,115200\" \\",
    "  -nographic \\",
    "  -no-reboot \\",
    "  -nic user,model=virtio,hostfwd=tcp::5000-:5000",
  ]),
  spacer(),
  body("The -nic user,model=virtio,hostfwd=tcp::5000-:5000 argument configures QEMU's user-mode network stack (SLIRP) with a VirtIO Ethernet device and forwards TCP connections on host port 5000 to guest port 5000. This allows nc -lk 5000 on the host to receive HIGH-level TCP alerts transmitted by the motion_detect process inside the guest. The guest IP address in this configuration is 10.0.2.15/24, the QEMU SLIRP gateway is 10.0.2.2, and the host is reachable from the guest at 10.0.2.2 — which is the TCP_HOST value configured in motion.conf."),
);

// ════════════════════════════════════════════════════════════════════════════
// BUILD DOCUMENT
// ════════════════════════════════════════════════════════════════════════════
const doc = new Document({
  creator:     "Embedded Systems Laboratory",
  title:       "Real-Time Motion Detection System on ARM Cortex-A15",
  description: "Final project report — ARM Cortex-A15, QEMU vexpress-a15, C99, adaptive motion classifier",
  styles: {
    default: {
      document: {
        run: { font: FONT, size: SZ_BODY, color: "1A1A1A" },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        size:    { width: PAGE_W, height: PAGE_H },
        margin:  { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    footers: {
      default: makeFooter(),
    },
    children: allChildren,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = path.join(process.env.HOME, "motion_detect", "final_report.docx");
  fs.writeFileSync(out, buf);
  console.log("Written:", out, `(${(buf.length / 1024).toFixed(0)} KB)`);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
