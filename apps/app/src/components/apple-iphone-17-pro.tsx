"use client";

import type { ReactNode } from "react";
import styles from "./apple-iphone-17-pro.module.css";

export interface IPhoneProps {
  children?: ReactNode;
  className?: string;
  time?: string;
}

export function IPhone17ProMax({ children, className, time = "9:41" }: IPhoneProps) {
  return (
    <div className={`${styles.stage} ${className ?? ""}`} role="group" aria-label="iPhone 17 Pro Max preview">
      <div className={styles.phone}>
        <div className={styles.frame}>
          <div className={styles.bezel}>
            <div className={styles.screen}>
              <div className={styles.statusBar} aria-hidden="true">
                <time className={styles.time}>{time}</time>
                <span className={styles.dynamicIsland}>
                  <span className={styles.camera} />
                </span>
                <span className={styles.statusIcons}>
                  <span className={styles.signal} />
                  <span className={styles.wifi} />
                  <span className={styles.battery} />
                </span>
              </div>
              <div className={styles.screenContent}>{children}</div>
              <div className={styles.homeIndicator} aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
        </div>
        <span className={styles.powerButton} aria-hidden="true" />
        <span className={styles.actionButton} aria-hidden="true" />
        <span className={styles.volumeButton} aria-hidden="true" />
      </div>
    </div>
  );
}

export default IPhone17ProMax;
