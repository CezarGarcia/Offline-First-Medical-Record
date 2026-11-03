package br.univates.medicalfield.clinico.auditoria;

import br.univates.medicalfield.clinico.comum.Banco;
import java.time.Duration;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Grava o log de acesso em auditoria.log_acesso numa thread separada. O usuário do banco do
 * ms-clinico só tem permissão de INSERT nessa tabela (D-04), por isso não há RETURNING.
 * Se a gravação falhar, o erro vai para o log técnico e a requisição não é afetada.
 */
@Component
public class RegistradorDeAcessos implements DisposableBean {

    private static final Logger LOG = LoggerFactory.getLogger(RegistradorDeAcessos.class);

    private final JdbcClient jdbc;
    private final AtomicInteger pendentes = new AtomicInteger();
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1, 2, 30, TimeUnit.SECONDS, new LinkedBlockingQueue<>(10_000),
            tarefa -> {
                Thread thread = new Thread(tarefa, "log-de-acesso");
                thread.setDaemon(true);
                return thread;
            });

    public RegistradorDeAcessos(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public void registrar(LogAcesso log) {
        pendentes.incrementAndGet();
        try {
            executor.execute(() -> {
                try {
                    inserir(log);
                } catch (RuntimeException e) {
                    LOG.error("falha ao gravar o log de acesso", e);
                } finally {
                    pendentes.decrementAndGet();
                }
            });
        } catch (RejectedExecutionException e) {
            pendentes.decrementAndGet();
            LOG.warn("fila do log de acesso cheia: registro descartado ({} {})", log.metodo(), log.rota());
        }
    }

    /** Espera as gravações em andamento (usado nos testes e no desligamento). */
    public boolean aguardarPendentes(Duration limite) {
        long fim = System.nanoTime() + limite.toNanos();
        while (pendentes.get() > 0 && System.nanoTime() < fim) {
            try {
                Thread.sleep(10);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return pendentes.get() == 0;
    }

    private void inserir(LogAcesso log) {
        jdbc.sql("""
                INSERT INTO auditoria.log_acesso
                  (data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms,
                   dispositivo_id, user_agent)
                VALUES (:dataHora, 'ms-clinico', :ip, :profissional, :metodo, :rota, :status, :tempo,
                        :dispositivo, :agente)
                """)
                .param("dataHora", Banco.utc(log.dataHora()))
                .param("ip", log.ipCliente())
                .param("profissional", log.profissionalId())
                .param("metodo", log.metodo())
                .param("rota", log.rota())
                .param("status", log.statusCode())
                .param("tempo", log.tempoMs())
                .param("dispositivo", log.dispositivoId())
                .param("agente", log.userAgent())
                .update();
    }

    @Override
    public void destroy() throws InterruptedException {
        aguardarPendentes(Duration.ofSeconds(5));
        executor.shutdown();
        executor.awaitTermination(5, TimeUnit.SECONDS);
    }
}
