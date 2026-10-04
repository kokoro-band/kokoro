package com.kokoro.room;

import org.apache.catalina.startup.Tomcat;
import org.apache.commons.compress.archivers.ArchiveStreamFactory;
import org.apache.el.ExpressionFactoryImpl;
import org.apache.tomcat.websocket.WsWebSocketContainer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/** Guards the audited baseline, not vulnerabilities discovered after the audit. */
class DependencySecurityTest {
    static Stream<Class<?>> tomcatImplementations() {
        return Stream.of(Tomcat.class, ExpressionFactoryImpl.class, WsWebSocketContainer.class);
    }

    @ParameterizedTest
    @MethodSource("tomcatImplementations")
    void tomcatUsesPatchedReleaseInAuditedBranch(Class<?> implementation) {
        int[] version = releaseVersion(implementation);
        assertThat(version[0]).as("audited Tomcat major").isEqualTo(11);
        assertThat(version[1]).as("audited Tomcat minor").isZero();
        assertThat(version[2]).as("Tomcat patch must include the 11.0.26 security fixes")
                .isGreaterThanOrEqualTo(26);
    }

    @Test
    void tomcatCoreElAndWebsocketUseTheSameRelease() {
        String core = Tomcat.class.getPackage().getImplementationVersion();
        assertThat(ExpressionFactoryImpl.class.getPackage().getImplementationVersion()).isEqualTo(core);
        assertThat(WsWebSocketContainer.class.getPackage().getImplementationVersion()).isEqualTo(core);
    }

    @Test
    void commonsCompressCannotRegressBelowAuditedRelease() {
        int[] version = releaseVersion(ArchiveStreamFactory.class);
        assertThat(version[0]).as("audited Commons Compress major").isEqualTo(1);
        assertThat(version[1]).as("Commons Compress audited baseline 1.28.0")
                .isGreaterThanOrEqualTo(28);
    }

    private static int[] releaseVersion(Class<?> implementation) {
        String version = implementation.getPackage().getImplementationVersion();
        assertThat(version).as("actual loaded version of %s", implementation.getName())
                .isNotNull().matches("[0-9]+\\.[0-9]+\\.[0-9]+");
        return Stream.of(version.split("\\.")).mapToInt(Integer::parseInt).toArray();
    }
}
